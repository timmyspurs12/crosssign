//! # CrossSign Verifier
//!
//! On-chain **Ed25519** signature verification for Arbitrum Stylus.
//!
//! A user proves ownership of a foreign wallet (e.g. a Solana / Phantom key)
//! by signing a canonical CrossSign challenge. This contract:
//!
//! 1. reconstructs the **exact** message the wallet must have signed
//!    (binding it to this contract, this chain, the wallet, a nonce and an
//!    expiry — see [`canonical_message`]),
//! 2. verifies the Ed25519 signature **on-chain** using `ed25519-dalek`
//!    compiled to WASM (the EVM cannot do this natively),
//! 3. enforces replay protection (single-use nonce + expiry window),
//! 4. calls the CrossSign BadgeRegistry to issue a soulbound badge.
//!
//! The contract independently enforces domain, chain, contract, wallet, nonce
//! and expiry — it never trusts a client-supplied timestamp or a client claim
//! about what was signed.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;

use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use stylus_sdk::{
    alloy_primitives::{Address, B256, U256},
    alloy_sol_types::sol,
    crypto::keccak,
    hex,
    prelude::*,
    storage::{
        StorageAddress, StorageBool, StorageBytes, StorageMap, StorageString, StorageU256,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Canonical challenge — single source of truth for the signed message
// ─────────────────────────────────────────────────────────────────────────────

/// First line of every CrossSign challenge. Also the "domain separator".
pub const MESSAGE_MAGIC: &str = "CROSSSIGN_VERIFY";

/// The action being authorized.
pub const ACTION: &str = "verify_wallet";

/// Domain string; prevents replay across CrossSign deployments/products.
pub const DOMAIN: &str = "crosssign.verification";

/// Maximum challenge lifetime the contract will accept (seconds).
pub const MAX_TTL_SECONDS: u64 = 3600;

/// Allowed nonce length (inclusive).
pub const NONCE_MIN_LEN: usize = 8;
pub const NONCE_MAX_LEN: usize = 64;

/// Build the canonical message a wallet must sign.
///
/// Encoding is deterministic and mirrored 1:1 by the frontend
/// (`lib/canonical.ts`):
///
/// ```text
/// CROSSSIGN_VERIFY
/// action=verify_wallet
/// domain=crosssign.verification
/// chain=<decimal chain id>
/// contract=0x<40 lowercase hex>
/// wallet=0x<64 lowercase hex>
/// nonce=<nonce>
/// expires=<decimal unix seconds>
/// ```
///
/// Lines are joined with `\n`; there is no trailing newline. The wallet is the
/// 32-byte public key as lowercase hex (not base58), chosen because it is
/// trivially reconstructable on both sides without extra dependencies.
pub fn canonical_message(
    chain_id: u64,
    contract: Address,
    wallet: &[u8],
    nonce: &str,
    expires: u64,
) -> String {
    let mut s = String::new();
    s.push_str(MESSAGE_MAGIC);
    s.push_str("\naction=");
    s.push_str(ACTION);
    s.push_str("\ndomain=");
    s.push_str(DOMAIN);
    s.push_str("\nchain=");
    s.push_str(&chain_id.to_string());
    s.push_str("\ncontract=0x");
    s.push_str(&hex::encode(contract));
    s.push_str("\nwallet=0x");
    s.push_str(&hex::encode(wallet));
    s.push_str("\nnonce=");
    s.push_str(nonce);
    s.push_str("\nexpires=");
    s.push_str(&expires.to_string());
    s
}

/// A nonce is a short, URL-safe alphanumeric token.
fn valid_nonce(nonce: &str) -> bool {
    let b = nonce.as_bytes();
    (NONCE_MIN_LEN..=NONCE_MAX_LEN).contains(&b.len())
        && b.iter()
            .all(|c| c.is_ascii_alphanumeric() || *c == b'-' || *c == b'_')
}

/// Verify an Ed25519 signature over `message` for a 32-byte `public_key`.
/// Returns `false` on malformed input instead of reverting.
fn verify_ed25519(public_key: &[u8], signature: &[u8], message: &[u8]) -> bool {
    let pk: [u8; 32] = match public_key.try_into() {
        Ok(pk) => pk,
        Err(_) => return false,
    };
    let sig: [u8; 64] = match signature.try_into() {
        Ok(sig) => sig,
        Err(_) => return false,
    };

    let Ok(verifying_key) = VerifyingKey::from_bytes(&pk) else {
        return false;
    };
    let Ok(signature) = Signature::from_slice(&sig) else {
        return false;
    };

    verifying_key.verify(message, &signature).is_ok()
}

// ─────────────────────────────────────────────────────────────────────────────
// ABI types
// ─────────────────────────────────────────────────────────────────────────────

sol! {
    /// Public verification record for an Arbitrum address.
    #[derive(Debug, AbiType)]
    struct Verification {
        address owner;
        bytes public_key;
        string origin_network;
        string destination_network;
        uint256 chain_id;
        uint256 verified_at;
        uint256 badge_id;
        bool active;
    }

    event VerificationRequested(
        address indexed wallet,
        bytes public_key,
        string nonce,
        uint64 expires
    );

    event WalletVerified(
        address indexed wallet,
        uint256 indexed badge_id,
        bytes public_key,
        uint256 verified_at
    );

    #[derive(Debug)]
    error InvalidSignature();

    #[derive(Debug)]
    error InvalidPublicKey();

    #[derive(Debug)]
    error InvalidNonce();

    #[derive(Debug)]
    error ChallengeExpired();

    #[derive(Debug)]
    error ChallengeTooFarFuture();

    #[derive(Debug)]
    error NonceAlreadyUsed();

    #[derive(Debug)]
    error AlreadyVerified();

    #[derive(Debug)]
    error NotOwner();

    #[derive(Debug)]
    error RegistryCallFailed();
}

#[derive(SolidityError, Debug)]
pub enum CrossSignVerifierError {
    InvalidSignature(InvalidSignature),
    InvalidPublicKey(InvalidPublicKey),
    InvalidNonce(InvalidNonce),
    ChallengeExpired(ChallengeExpired),
    ChallengeTooFarFuture(ChallengeTooFarFuture),
    NonceAlreadyUsed(NonceAlreadyUsed),
    AlreadyVerified(AlreadyVerified),
    NotOwner(NotOwner),
    RegistryCallFailed(RegistryCallFailed),
}

// Typed view of the BadgeRegistry — the only function we need is `issue`.
sol_interface! {
    interface ICrossSignBadgeRegistry {
        function issue(address recipient, bytes public_key, string origin_network) external returns (uint256);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

#[storage]
#[entrypoint]
pub struct CrossSignVerifier {
    /// Deployer (can update the registry pointer).
    owner: StorageAddress,

    /// The BadgeRegistry contract that issues soulbound badges.
    badge_registry: StorageAddress,

    /// Human label for the destination chain (e.g. "arbitrum-sepolia").
    destination_network: StorageString,

    /// Total successful verifications.
    verification_count: StorageU256,

    /// Arbitrum address → verified?
    verified: StorageMap<Address, StorageBool>,

    /// Arbitrum address → verified foreign public key.
    wallet_pubkeys: StorageMap<Address, StorageBytes>,

    /// Arbitrum address → origin network tag.
    wallet_origin_networks: StorageMap<Address, StorageString>,

    /// Arbitrum address → issued badge id.
    wallet_badge_ids: StorageMap<Address, StorageU256>,

    /// Arbitrum address → verification timestamp.
    wallet_verified_at: StorageMap<Address, StorageU256>,

    /// Replay protection: keccak256(nonce) → used?
    used_nonces: StorageMap<B256, StorageBool>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract API
// ─────────────────────────────────────────────────────────────────────────────

#[public]
impl CrossSignVerifier {
    /// Deploy-time constructor. `badge_registry` is the registry that will
    /// issue badges; `destination_network` labels this deployment.
    #[constructor]
    #[payable]
    pub fn constructor(&mut self, badge_registry: Address, destination_network: String) {
        self.owner.set(self.vm().tx_origin());
        self.badge_registry.set(badge_registry);
        self.destination_network.set_str(destination_network);
    }

    // ── Introspection ───────────────────────────────────────────────────────

    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    pub fn badge_registry(&self) -> Address {
        self.badge_registry.get()
    }

    pub fn chain_id(&self) -> u64 {
        self.vm().chain_id()
    }

    /// The verifier's own address (this contract).
    pub fn verifier_address(&self) -> Address {
        self.vm().contract_address()
    }

    /// The destination-network label set at deploy time.
    pub fn destination_network(&self) -> String {
        self.destination_network.get_string()
    }

    pub fn verification_count(&self) -> U256 {
        self.verification_count.get()
    }

    // ── Challenge building ──────────────────────────────────────────────────

    /// Build the canonical challenge message for a wallet to sign.
    /// This is exactly the message `verify_and_issue` will reconstruct.
    pub fn build_challenge(
        &self,
        public_key: Vec<u8>,
        nonce: String,
        expires: u64,
    ) -> Result<String, CrossSignVerifierError> {
        if public_key.len() != 32 {
            return Err(CrossSignVerifierError::InvalidPublicKey(InvalidPublicKey {}));
        }
        if !valid_nonce(&nonce) {
            return Err(CrossSignVerifierError::InvalidNonce(InvalidNonce {}));
        }
        Ok(canonical_message(
            self.vm().chain_id(),
            self.vm().contract_address(),
            &public_key,
            &nonce,
            expires,
        ))
    }

    // ── Raw verification ────────────────────────────────────────────────────

    /// Pure on-chain Ed25519 verification — no state changes. Runs in Rust
    /// inside Stylus; the EVM cannot do this natively.
    pub fn verify_signature(
        &self,
        public_key: Vec<u8>,
        signature: Vec<u8>,
        message: Vec<u8>,
    ) -> bool {
        verify_ed25519(&public_key, &signature, &message)
    }

    // ── Verify + issue ──────────────────────────────────────────────────────

    /// Verify a signed challenge and issue a soulbound badge to the caller.
    ///
    /// Enforced, in order: not already verified → key/signature lengths →
    /// nonce format → nonce not reused → expiry window → Ed25519 verification
    /// of the reconstructed canonical message → registry issues the badge.
    pub fn verify_and_issue(
        &mut self,
        public_key: Vec<u8>,
        nonce: String,
        expires: u64,
        signature: Vec<u8>,
        origin_network: String,
    ) -> Result<U256, CrossSignVerifierError> {
        let caller = self.vm().msg_sender();

        if self.verified.get(caller) {
            return Err(CrossSignVerifierError::AlreadyVerified(AlreadyVerified {}));
        }
        if public_key.len() != 32 {
            return Err(CrossSignVerifierError::InvalidPublicKey(InvalidPublicKey {}));
        }
        if signature.len() != 64 {
            return Err(CrossSignVerifierError::InvalidSignature(InvalidSignature {}));
        }
        if !valid_nonce(&nonce) {
            return Err(CrossSignVerifierError::InvalidNonce(InvalidNonce {}));
        }

        let nonce_hash = keccak(nonce.as_bytes());
        if self.used_nonces.get(nonce_hash) {
            return Err(CrossSignVerifierError::NonceAlreadyUsed(NonceAlreadyUsed {}));
        }

        let now = self.vm().block_timestamp();
        if expires <= now {
            return Err(CrossSignVerifierError::ChallengeExpired(ChallengeExpired {}));
        }
        if expires > now + MAX_TTL_SECONDS {
            return Err(CrossSignVerifierError::ChallengeTooFarFuture(
                ChallengeTooFarFuture {},
            ));
        }

        // Reconstruct the EXACT message the wallet must have signed. This
        // binds the signature to this contract, this chain, this wallet, this
        // nonce and this expiry — replaying on another chain/contract, or with
        // a different nonce/expiry, produces a different message and fails.
        let message = canonical_message(
            self.vm().chain_id(),
            self.vm().contract_address(),
            &public_key,
            &nonce,
            expires,
        );

        if !verify_ed25519(&public_key, &signature, message.as_bytes()) {
            return Err(CrossSignVerifierError::InvalidSignature(InvalidSignature {}));
        }

        // Commit: burn the nonce first.
        self.used_nonces.setter(nonce_hash).set(true);

        // Issue the badge via the registry (reverts the whole tx on failure).
        let registry_addr = self.badge_registry.get();
        let config = Call::new_mutating(self);
        let registry = ICrossSignBadgeRegistry::new(registry_addr);
        let badge_id = registry
            .issue(
                self.vm(),
                config,
                caller,
                public_key.clone().into(),
                origin_network.clone(),
            )
            .map_err(|_| CrossSignVerifierError::RegistryCallFailed(RegistryCallFailed {}))?;

        // Record the verification.
        let verified_at = U256::from(now);
        self.verified.setter(caller).set(true);
        self.wallet_pubkeys.setter(caller).set_bytes(public_key.clone());
        self.wallet_origin_networks
            .setter(caller)
            .set_str(origin_network.clone());
        self.wallet_badge_ids.setter(caller).set(badge_id);
        self.wallet_verified_at.setter(caller).set(verified_at);
        let count = self.verification_count.get() + U256::from(1);
        self.verification_count.set(count);

        self.vm().log(VerificationRequested {
            wallet: caller,
            public_key: public_key.clone().into(),
            nonce: nonce.clone(),
            expires,
        });
        self.vm().log(WalletVerified {
            wallet: caller,
            badge_id,
            public_key: public_key.into(),
            verified_at,
        });

        Ok(badge_id)
    }

    // ── Read API ────────────────────────────────────────────────────────────

    pub fn is_verified(&self, account: Address) -> bool {
        self.verified.get(account)
    }

    pub fn verification_of(&self, account: Address) -> Verification {
        let verified = self.verified.get(account);
        Verification {
            owner: account,
            public_key: self.wallet_pubkeys.get(account).get_bytes().into(),
            origin_network: self.wallet_origin_networks.get(account).get_string(),
            destination_network: self.destination_network.get_string(),
            chain_id: U256::from(self.vm().chain_id()),
            verified_at: self.wallet_verified_at.get(account),
            badge_id: self.wallet_badge_ids.get(account),
            active: verified,
        }
    }

    pub fn nonce_used(&self, nonce: String) -> bool {
        self.used_nonces.get(keccak(nonce.as_bytes()))
    }

    // ── Admin ───────────────────────────────────────────────────────────────

    /// Owner-only: point the verifier at a (new) badge registry.
    pub fn set_badge_registry(&mut self, registry: Address) -> Result<(), CrossSignVerifierError> {
        if self.vm().msg_sender() != self.owner.get() {
            return Err(CrossSignVerifierError::NotOwner(NotOwner {}));
        }
        self.badge_registry.set(registry);
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use alloy_sol_types::SolCall;
    use ed25519_dalek::{Signer, SigningKey};
    use stylus_sdk::testing::*;

    const DEST: &str = "arbitrum-sepolia";
    const REGISTRY: Address = Address::new([0xBB; 20]);
    const CHAIN_ID: u64 = 421614; // Arbitrum Sepolia
    const NOW: u64 = 1_800_000_000; // fixed mock-VM clock (unix seconds)

    // `issue(address,bytes,string)` call type — used only to build the exact
    // calldata the verifier sends to the registry, so tests can mock it.
    sol! {
        function issue(address recipient, bytes public_key, string origin_network) returns (uint256);
    }

    fn deploy() -> (TestVM, CrossSignVerifier) {
        let vm = TestVM::default();
        vm.set_chain_id(CHAIN_ID);
        vm.set_block_timestamp(NOW);
        let mut contract = CrossSignVerifier::from(&vm);
        contract.constructor(REGISTRY, String::from(DEST));
        (vm, contract)
    }

    fn keypair() -> (SigningKey, [u8; 32]) {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = signing_key.verifying_key().to_bytes();
        (signing_key, pubkey)
    }

    fn sign(signing_key: &SigningKey, message: &str) -> Vec<u8> {
        signing_key.sign(message.as_bytes()).to_bytes().to_vec()
    }

    fn challenge_for(pubkey: &[u8], nonce: &str, expires: u64, chain: u64, contract: Address) -> String {
        canonical_message(chain, contract, pubkey, nonce, expires)
    }

    /// Mock the verifier → registry call to return `badge_id`.
    fn mock_registry(vm: &TestVM, recipient: Address, public_key: Vec<u8>, badge_id: u64) {
        let calldata = issueCall {
            recipient,
            public_key: public_key.into(),
            origin_network: String::from("mainnet-beta"),
        }
        .abi_encode();
        let ret = U256::from(badge_id).to_be_bytes::<32>().to_vec();
        vm.mock_call(REGISTRY, calldata, U256::ZERO, Ok(ret));
    }

    fn valid_call(
        vm: &TestVM,
        contract: &mut CrossSignVerifier,
        nonce: &str,
        expires: u64,
    ) -> Result<U256, CrossSignVerifierError> {
        let (_sk, pubkey) = keypair();
        let message = challenge_for(&pubkey, nonce, expires, CHAIN_ID, contract.verifier_address());
        let signature = sign(&_sk, &message);
        mock_registry(vm, vm.msg_sender(), pubkey.to_vec(), 1);
        contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        )
    }

    // ── Canonical message ───────────────────────────────────────────────────

    #[test]
    fn canonical_message_fixture_matches_spec() {
        // Fixed fixture, byte-for-byte. The frontend asserts the same bytes in
        // scripts/check-canonical.mjs, so a divergence breaks both sides.
        let wallet: Vec<u8> = (0u8..32).collect();
        let msg = canonical_message(
            421614,
            Address::new([0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56, 0x78, 0x90,
                          0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56, 0x78, 0x90]),
            &wallet,
            "ab12cd34ef56",
            1728000000,
        );
        assert_eq!(
            msg,
            "CROSSSIGN_VERIFY\n\
             action=verify_wallet\n\
             domain=crosssign.verification\n\
             chain=421614\n\
             contract=0x1234567890123456789012345678901234567890\n\
             wallet=0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\n\
             nonce=ab12cd34ef56\n\
             expires=1728000000"
        );
    }

    #[test]
    fn build_challenge_matches_canonical() {
        let (_vm, contract) = deploy();
        let (_sk, pubkey) = keypair();
        let nonce = String::from("testnonce1");
        let expires = NOW + 600;

        let built = contract
            .build_challenge(pubkey.to_vec(), nonce.clone(), expires)
            .unwrap();
        let expected = canonical_message(
            CHAIN_ID,
            contract.verifier_address(),
            &pubkey,
            &nonce,
            expires,
        );
        assert_eq!(built, expected);
    }

    // ── Happy path ──────────────────────────────────────────────────────────

    #[test]
    fn valid_flow_verifies_and_issues() {
        let (vm, mut contract) = deploy();
        let sender = vm.msg_sender();
        let nonce = "testnonce1";
        let expires = NOW + 600;

        let badge_id = valid_call(&vm, &mut contract, nonce, expires).unwrap();

        assert_eq!(badge_id, U256::from(1));
        assert!(contract.is_verified(sender));
        assert!(contract.nonce_used(String::from(nonce)));

        let rec = contract.verification_of(sender);
        assert!(rec.active);
        assert_eq!(rec.badge_id, U256::from(1));
        assert_eq!(rec.destination_network, String::from(DEST));
        assert_eq!(rec.chain_id, U256::from(CHAIN_ID));
    }

    // ── Signature failures ──────────────────────────────────────────────────

    #[test]
    fn rejects_invalid_signature() {
        let (vm, mut contract) = deploy();
        let (_sk, pubkey) = keypair();
        let nonce = "testnonce1";
        let expires = NOW + 600;

        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);
        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            vec![0xAB; 64], // garbage
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidSignature(_))));
    }

    #[test]
    fn rejects_wrong_public_key() {
        let (vm, mut contract) = deploy();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let nonce = "testnonce1";
        let expires = NOW + 600;
        let message = challenge_for(&pubkey, nonce, expires, CHAIN_ID, contract.verifier_address());
        let signature = sign(&sk, &message);

        // Sign with key A, claim key B.
        let wrong_pubkey = [9u8; 32];
        mock_registry(&vm, vm.msg_sender(), wrong_pubkey.to_vec(), 1);
        let res = contract.verify_and_issue(
            wrong_pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidSignature(_))));
    }

    #[test]
    fn rejects_modified_message() {
        let (vm, mut contract) = deploy();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let nonce = "testnonce1";
        let expires = NOW + 600;

        // Sign a message that differs from the canonical one (different nonce).
        let wrong_message = challenge_for(&pubkey, "differentnonce", expires, CHAIN_ID, contract.verifier_address());
        let signature = sign(&sk, &wrong_message);

        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);
        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce), // canonical nonce differs from the signed one
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidSignature(_))));
    }

    #[test]
    fn rejects_wrong_chain() {
        let (vm, mut contract) = deploy();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let nonce = "testnonce1";
        let expires = NOW + 600;

        // Signed for a different chain id (e.g. Arbitrum One).
        let wrong = challenge_for(&pubkey, nonce, expires, 42161, contract.verifier_address());
        let signature = sign(&sk, &wrong);

        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);
        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidSignature(_))));
    }

    #[test]
    fn rejects_wrong_contract() {
        let (vm, mut contract) = deploy();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let nonce = "testnonce1";
        let expires = NOW + 600;

        // Signed for a different verifier address.
        let wrong = challenge_for(&pubkey, nonce, expires, CHAIN_ID, Address::new([0xEE; 20]));
        let signature = sign(&sk, &wrong);

        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);
        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidSignature(_))));
    }

    #[test]
    fn rejects_wrong_domain() {
        let (vm, mut contract) = deploy();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let nonce = "testnonce1";
        let expires = NOW + 600;

        // Sign a message with the correct structure but a forged domain line.
        let forged = format!(
            "CROSSSIGN_VERIFY\naction=verify_wallet\ndomain=evil.example\nchain={CHAIN_ID}\ncontract=0x{}\nwallet=0x{}\nnonce={nonce}\nexpires={expires}",
            hex::encode(contract.verifier_address()),
            hex::encode(pubkey),
        );
        let signature = sign(&sk, &forged);

        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);
        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidSignature(_))));
    }

    // ── Time & nonce enforcement ────────────────────────────────────────────

    #[test]
    fn rejects_expired_challenge() {
        let (vm, mut contract) = deploy();
        vm.set_block_timestamp(1_000_000);

        let (_sk, pubkey) = keypair();
        let nonce = "testnonce1";
        let expires = 999_999; // already past

        let message = challenge_for(&pubkey, nonce, expires, CHAIN_ID, contract.verifier_address());
        let signature = sign(&_sk, &message);
        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);

        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::ChallengeExpired(_))));
    }

    #[test]
    fn rejects_far_future_expiry() {
        let (vm, mut contract) = deploy();
        vm.set_block_timestamp(1_000_000);

        let (_sk, pubkey) = keypair();
        let nonce = "testnonce1";
        let expires = 1_000_000 + MAX_TTL_SECONDS + 1; // beyond the TTL window

        let message = challenge_for(&pubkey, nonce, expires, CHAIN_ID, contract.verifier_address());
        let signature = sign(&_sk, &message);
        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);

        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(
            res,
            Err(CrossSignVerifierError::ChallengeTooFarFuture(_))
        ));
    }

    #[test]
    fn rejects_replayed_nonce() {
        let (vm, mut contract) = deploy();
        vm.set_block_timestamp(1_000_000);

        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let nonce = "testnonce1";
        let expires = 1_000_000 + 600;

        let message = challenge_for(&pubkey, nonce, expires, CHAIN_ID, contract.verifier_address());
        let signature = sign(&sk, &message);

        // First use succeeds.
        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 1);
        assert!(contract
            .verify_and_issue(
                pubkey.to_vec(),
                String::from(nonce),
                expires,
                signature.clone(),
                String::from("mainnet-beta"),
            )
            .is_ok());

        // Second caller reusing the same nonce (and signature) is rejected
        // even before signature verification.
        vm.set_sender(Address::from([0x42; 20]));
        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 2);
        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::NonceAlreadyUsed(_))));
    }

    // ── Duplicate badge ─────────────────────────────────────────────────────

    #[test]
    fn rejects_duplicate_badge_for_same_address() {
        let (vm, mut contract) = deploy();
        vm.set_block_timestamp(1_000_000);

        // First verification (nonce A) succeeds.
        assert!(valid_call(&vm, &mut contract, "nonceaaaa", 1_000_000 + 600).is_ok());

        // Second verification (nonce B, valid signature) is rejected: the
        // address already holds a badge.
        let sk = SigningKey::from_bytes(&[8u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let nonce = "noncebbbb";
        let expires = 1_000_000 + 600;
        let message = challenge_for(&pubkey, nonce, expires, CHAIN_ID, contract.verifier_address());
        let signature = sign(&sk, &message);
        mock_registry(&vm, vm.msg_sender(), pubkey.to_vec(), 2);

        let res = contract.verify_and_issue(
            pubkey.to_vec(),
            String::from(nonce),
            expires,
            signature,
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::AlreadyVerified(_))));
    }

    // ── Malformed input ─────────────────────────────────────────────────────

    #[test]
    fn rejects_bad_public_key_length() {
        let (_vm, mut contract) = deploy();
        let res = contract.verify_and_issue(
            vec![1u8; 31],
            String::from("testnonce1"),
            1_800_000_000,
            vec![2u8; 64],
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidPublicKey(_))));
    }

    #[test]
    fn rejects_bad_signature_length() {
        let (_vm, mut contract) = deploy();
        let res = contract.verify_and_issue(
            vec![1u8; 32],
            String::from("testnonce1"),
            1_800_000_000,
            vec![2u8; 63],
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidSignature(_))));
    }

    #[test]
    fn rejects_invalid_nonce_format() {
        let (_vm, mut contract) = deploy();
        let res = contract.verify_and_issue(
            vec![1u8; 32],
            String::from("short"), // too short
            1_800_000_000,
            vec![2u8; 64],
            String::from("mainnet-beta"),
        );
        assert!(matches!(res, Err(CrossSignVerifierError::InvalidNonce(_))));

        let res2 = contract.verify_and_issue(
            vec![1u8; 32],
            String::from("has spaces and symbols!"),
            1_800_000_000,
            vec![2u8; 64],
            String::from("mainnet-beta"),
        );
        assert!(matches!(res2, Err(CrossSignVerifierError::InvalidNonce(_))));
    }

    #[test]
    fn verify_signature_view_reports_correctly() {
        let (_vm, contract) = deploy();
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey = sk.verifying_key().to_bytes();
        let message = "hello crosssign";
        let signature = sign(&sk, message);

        assert!(contract.verify_signature(pubkey.to_vec(), signature.clone(), message.as_bytes().to_vec()));
        assert!(!contract.verify_signature(pubkey.to_vec(), signature, b"tampered".to_vec()));
    }
}
