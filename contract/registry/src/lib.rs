//! # CrossSign BadgeRegistry
//!
//! Issues **soulbound** CrossSign verification badges on Arbitrum Stylus.
//!
//! A badge records that a given Arbitrum address demonstrated control of a
//! foreign wallet (e.g. a Solana Ed25519 key) — it is **not** a claim about a
//! person's real-world identity.
//!
//! ## Design choices
//! - **Not an ERC-721.** A badge is a plain registry record with no transfer
//!   function at all. Removing the transfer path entirely eliminates the
//!   entire class of "soulbound token transfer loopholes" rather than trying
//!   to override `safeTransferFrom`/`transferFrom` correctly.
//! - **Authorized issuer.** Only the configured issuer (the CrossSignVerifier
//!   contract) or the owner may mint, so a badge cannot be created without a
//!   successful on-chain verification.
//! - **One badge per address.** Duplicate issuance is rejected.
//! - **Revoke ≠ re-issue.** Revoking deactivates the badge but keeps the
//!   address marked, so a revoked identity cannot re-verify under a new key.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;

use stylus_sdk::{
    alloy_primitives::{Address, U256},
    alloy_sol_types::sol,
    prelude::*,
    storage::{
        StorageAddress, StorageBool, StorageBytes, StorageMap, StorageString, StorageU256,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// ABI types
// ─────────────────────────────────────────────────────────────────────────────

sol! {
    /// A CrossSign verification badge record.
    #[derive(Debug, AbiType)]
    struct Badge {
        address owner;
        bytes public_key;
        string origin_network;
        uint256 verified_at;
        uint256 badge_id;
        bool active;
    }

    event BadgeIssued(
        address indexed owner,
        uint256 indexed badge_id,
        bytes public_key,
        string origin_network
    );

    event BadgeRevoked(address indexed owner, uint256 indexed badge_id);

    #[derive(Debug)]
    error Unauthorized();

    #[derive(Debug)]
    error ZeroAddress();

    #[derive(Debug)]
    error InvalidPublicKey();

    #[derive(Debug)]
    error BadgeAlreadyIssued();

    #[derive(Debug)]
    error NotOwner();
}

#[derive(SolidityError, Debug)]
pub enum CrossSignBadgeRegistryError {
    Unauthorized(Unauthorized),
    ZeroAddress(ZeroAddress),
    InvalidPublicKey(InvalidPublicKey),
    BadgeAlreadyIssued(BadgeAlreadyIssued),
    NotOwner(NotOwner),
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

#[storage]
#[entrypoint]
pub struct CrossSignBadgeRegistry {
    /// Deployer — the only address that can change the issuer or revoke.
    owner: StorageAddress,

    /// The CrossSignVerifier contract — the only address that can mint.
    issuer: StorageAddress,

    /// Total badges issued; doubles as the next badge id.
    badge_count: StorageU256,

    /// Arbitrum address → badge id (0 means "no badge").
    address_badge_id: StorageMap<Address, StorageU256>,

    /// Badge id → badge owner (Arbitrum address).
    badge_owner: StorageMap<U256, StorageAddress>,

    /// Badge id → verified foreign public key (32-byte Ed25519 key).
    badge_pubkey: StorageMap<U256, StorageBytes>,

    /// Badge id → origin network tag (e.g. "mainnet-beta").
    badge_origin_network: StorageMap<U256, StorageString>,

    /// Badge id → verification timestamp (unix seconds).
    badge_verified_at: StorageMap<U256, StorageU256>,

    /// Badge id → active flag (false after revoke).
    badge_active: StorageMap<U256, StorageBool>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract API
// ─────────────────────────────────────────────────────────────────────────────

#[public]
impl CrossSignBadgeRegistry {
    /// Deploy-time constructor. `issuer` is the verifier contract that will be
    /// authorized to mint; the deployer is the owner.
    #[constructor]
    #[payable]
    pub fn constructor(&mut self, issuer: Address) {
        self.owner.set(self.vm().tx_origin());
        self.issuer.set(issuer);
    }

    /// Mint a soulbound badge for `recipient`.
    ///
    /// Reverts unless called by the issuer or owner. Enforces one badge per
    /// recipient and a 32-byte public key.
    pub fn issue(
        &mut self,
        recipient: Address,
        public_key: Vec<u8>,
        origin_network: String,
    ) -> Result<U256, CrossSignBadgeRegistryError> {
        let caller = self.vm().msg_sender();
        if caller != self.issuer.get() && caller != self.owner.get() {
            return Err(CrossSignBadgeRegistryError::Unauthorized(Unauthorized {}));
        }
        if recipient == Address::ZERO {
            return Err(CrossSignBadgeRegistryError::ZeroAddress(ZeroAddress {}));
        }
        if public_key.len() != 32 {
            return Err(CrossSignBadgeRegistryError::InvalidPublicKey(InvalidPublicKey {}));
        }
        if self.address_badge_id.get(recipient) != U256::ZERO {
            return Err(CrossSignBadgeRegistryError::BadgeAlreadyIssued(BadgeAlreadyIssued {}));
        }

        let badge_id = self.badge_count.get() + U256::from(1);
        self.badge_count.set(badge_id);

        self.address_badge_id.setter(recipient).set(badge_id);
        self.badge_owner.setter(badge_id).set(recipient);
        self.badge_pubkey
            .setter(badge_id)
            .set_bytes(public_key.clone());
        self.badge_origin_network
            .setter(badge_id)
            .set_str(origin_network.clone());
        let verified_at = U256::from(self.vm().block_timestamp());
        self.badge_verified_at.setter(badge_id).set(verified_at);
        self.badge_active.setter(badge_id).set(true);

        self.vm().log(BadgeIssued {
            owner: recipient,
            badge_id,
            public_key: public_key.into(),
            origin_network,
        });

        Ok(badge_id)
    }

    // ── Read API ────────────────────────────────────────────────────────────

    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    pub fn issuer(&self) -> Address {
        self.issuer.get()
    }

    pub fn badge_count(&self) -> U256 {
        self.badge_count.get()
    }

    pub fn is_issued(&self, account: Address) -> bool {
        self.address_badge_id.get(account) != U256::ZERO
    }

    pub fn badge_id_of(&self, account: Address) -> U256 {
        self.address_badge_id.get(account)
    }

    /// Full badge record for a badge id (empty defaults if none exists).
    pub fn badge(&self, badge_id: U256) -> Badge {
        let owner = self.badge_owner.get(badge_id);
        Badge {
            owner,
            public_key: self.badge_pubkey.get(badge_id).get_bytes().into(),
            origin_network: self.badge_origin_network.get(badge_id).get_string(),
            verified_at: self.badge_verified_at.get(badge_id),
            badge_id,
            active: self.badge_active.get(badge_id),
        }
    }

    /// Full badge record for an Arbitrum address.
    pub fn badge_of(&self, account: Address) -> Badge {
        self.badge(self.address_badge_id.get(account))
    }

    // ── Admin ───────────────────────────────────────────────────────────────

    /// Owner-only: point the registry at a (new) verifier contract.
    pub fn set_issuer(
        &mut self,
        new_issuer: Address,
    ) -> Result<(), CrossSignBadgeRegistryError> {
        if self.vm().msg_sender() != self.owner.get() {
            return Err(CrossSignBadgeRegistryError::NotOwner(NotOwner {}));
        }
        self.issuer.set(new_issuer);
        Ok(())
    }

    /// Owner-only: deactivate a badge. The address stays marked so it cannot
    /// re-verify under a different key.
    pub fn revoke(&mut self, badge_id: U256) -> Result<(), CrossSignBadgeRegistryError> {
        if self.vm().msg_sender() != self.owner.get() {
            return Err(CrossSignBadgeRegistryError::NotOwner(NotOwner {}));
        }
        let owner = self.badge_owner.get(badge_id);
        if owner == Address::ZERO {
            return Ok(());
        }
        self.badge_active.setter(badge_id).set(false);
        self.vm().log(BadgeRevoked { owner, badge_id });
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    const PUBKEY: [u8; 32] = [7u8; 32];

    fn deploy() -> (TestVM, CrossSignBadgeRegistry, Address) {
        let vm = TestVM::default();
        let issuer = Address::from([0xAA; 20]);
        let mut contract = CrossSignBadgeRegistry::from(&vm);
        contract.constructor(issuer);
        (vm, contract, issuer)
    }

    fn issue_as(
        vm: &TestVM,
        contract: &mut CrossSignBadgeRegistry,
        caller: Address,
        recipient: Address,
    ) -> Result<U256, CrossSignBadgeRegistryError> {
        vm.set_sender(caller);
        contract.issue(recipient, PUBKEY.to_vec(), String::from("mainnet-beta"))
    }

    #[test]
    fn issuer_can_issue_badge() {
        let (vm, mut contract, issuer) = deploy();
        let recipient = Address::from([0x11; 20]);

        let badge_id = issue_as(&vm, &mut contract, issuer, recipient).unwrap();
        assert_eq!(badge_id, U256::from(1));
        assert!(contract.is_issued(recipient));
        assert_eq!(contract.badge_count(), U256::from(1));
    }

    #[test]
    fn owner_can_issue_badge() {
        let (vm, mut contract, _issuer) = deploy();
        let recipient = Address::from([0x22; 20]);
        let owner = vm.msg_sender();

        let badge_id = issue_as(&vm, &mut contract, owner, recipient).unwrap();
        assert_eq!(badge_id, U256::from(1));
    }

    #[test]
    fn unauthorized_address_cannot_issue() {
        let (vm, mut contract, _issuer) = deploy();
        let stranger = Address::from([0x33; 20]);
        let recipient = Address::from([0x11; 20]);

        let res = issue_as(&vm, &mut contract, stranger, recipient);
        assert!(matches!(res, Err(CrossSignBadgeRegistryError::Unauthorized(_))));
        assert!(!contract.is_issued(recipient));
    }

    #[test]
    fn duplicate_badge_rejected() {
        let (vm, mut contract, issuer) = deploy();
        let recipient = Address::from([0x11; 20]);

        assert!(issue_as(&vm, &mut contract, issuer, recipient).is_ok());
        let second = issue_as(&vm, &mut contract, issuer, recipient);
        assert!(matches!(
            second,
            Err(CrossSignBadgeRegistryError::BadgeAlreadyIssued(_))
        ));
    }

    #[test]
    fn zero_address_recipient_rejected() {
        let (vm, mut contract, issuer) = deploy();
        let res = issue_as(&vm, &mut contract, issuer, Address::ZERO);
        assert!(matches!(res, Err(CrossSignBadgeRegistryError::ZeroAddress(_))));
    }

    #[test]
    fn invalid_public_key_length_rejected() {
        let (vm, mut contract, issuer) = deploy();
        let recipient = Address::from([0x11; 20]);
        vm.set_sender(issuer);
        let res = contract.issue(recipient, vec![1u8; 31], String::from("mainnet-beta"));
        assert!(matches!(
            res,
            Err(CrossSignBadgeRegistryError::InvalidPublicKey(_))
        ));
    }

    #[test]
    fn badge_reads_are_consistent() {
        let (vm, mut contract, issuer) = deploy();
        let recipient = Address::from([0x11; 20]);
        let badge_id = issue_as(&vm, &mut contract, issuer, recipient).unwrap();

        let badge = contract.badge(badge_id);
        assert_eq!(badge.owner, recipient);
        assert_eq!(badge.origin_network, String::from("mainnet-beta"));
        assert_eq!(badge.badge_id, badge_id);
        assert!(badge.active);

        let by_addr = contract.badge_of(recipient);
        assert_eq!(by_addr.owner, recipient);
        assert_eq!(contract.badge_id_of(recipient), badge_id);
    }

    #[test]
    fn owner_can_revoke() {
        let (vm, mut contract, issuer) = deploy();
        let owner = vm.msg_sender(); // capture the deployer before issue_as switches the sender
        let recipient = Address::from([0x11; 20]);
        let badge_id = issue_as(&vm, &mut contract, issuer, recipient).unwrap();

        vm.set_sender(owner);
        contract.revoke(badge_id).unwrap();

        assert!(!contract.badge(badge_id).active);
        // Address remains marked — no re-issue.
        assert!(contract.is_issued(recipient));
    }

    #[test]
    fn non_owner_cannot_revoke() {
        let (vm, mut contract, issuer) = deploy();
        let recipient = Address::from([0x11; 20]);
        let badge_id = issue_as(&vm, &mut contract, issuer, recipient).unwrap();

        vm.set_sender(Address::from([0x99; 20]));
        assert!(matches!(
            contract.revoke(badge_id),
            Err(CrossSignBadgeRegistryError::NotOwner(_))
        ));
    }

    #[test]
    fn only_owner_can_change_issuer() {
        let (vm, mut contract, _issuer) = deploy();
        let owner = vm.msg_sender(); // the deployer

        // Non-owner fails.
        vm.set_sender(Address::from([0x99; 20]));
        assert!(matches!(
            contract.set_issuer(Address::from([0xBB; 20])),
            Err(CrossSignBadgeRegistryError::NotOwner(_))
        ));

        // Owner succeeds.
        vm.set_sender(owner);
        contract.set_issuer(Address::from([0xBB; 20])).unwrap();
        assert_eq!(contract.issuer(), Address::from([0xBB; 20]));
    }

    #[test]
    fn unknown_badge_reads_defaults() {
        let (_vm, contract, _issuer) = deploy();
        let badge = contract.badge(U256::from(999));
        assert_eq!(badge.owner, Address::ZERO);
        assert!(!badge.active);
        assert!(!contract.is_issued(Address::from([0x11; 20])));
    }
}
