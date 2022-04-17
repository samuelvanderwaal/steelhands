use anchor_lang::prelude::*;

#[error_code]
pub enum SteelError {
    // 6000
    #[msg("No bump found for Vault PDA!")]
    MissingVaultBump,

    // 6001
    #[msg("Unlock time cannot be in the past!")]
    InvalidUnlockTime,

    // 6002
    #[msg("Unlock amount must be greater than 0!")]
    InvalidUnlockAmount,

    // 6003
    #[msg("Can't update an active vault!")]
    VaultActive,

    // 6004
    #[msg("At least one condition must be set!")]
    MissingCondition,

    // 6005
    #[msg("Vault must be unlocked!")]
    VaultUnlocked,

    // 6006
    #[msg("Failed to close vault!")]
    FailedToCloseVault,
}
