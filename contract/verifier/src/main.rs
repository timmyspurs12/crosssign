//! Native `main` used by cargo-stylus to detect the constructor and export the ABI.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]

#[cfg(not(any(test, feature = "export-abi")))]
#[no_mangle]
pub extern "C" fn main() {}

#[cfg(feature = "export-abi")]
fn main() {
    crosssign_verifier::print_from_args();
}
