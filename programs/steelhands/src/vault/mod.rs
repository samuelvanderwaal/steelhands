use anchor_lang::{prelude::*, solana_program::program_memory::sol_memset};

use crate::{constants::*, errors::SteelError};

#[account]
pub struct Vault {
    /// Vault owner
    authority: Pubkey,
    /// Unlock time as a unix timestamp
    unlock_time: i64,
    /// Unlock amount in lamports
    unlock_amount: u64,
    /// Vault status
    active: bool,
    /// Vault PDA bump seed
    bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(init, payer = authority, space = VAULT_SPACE, seeds = [b"vault", authority.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    unlock_time: Option<i64>,
    unlock_amount: Option<u64>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.authority = ctx.accounts.authority.key();
    vault.bump = *ctx.bumps.get("vault").ok_or(SteelError::MissingVaultBump)?;
    vault.active = false;
    vault.unlock_time = 0;
    vault.unlock_amount = 0;

    if let Some(unlock_time) = unlock_time {
        if unlock_time < clock.unix_timestamp {
            return Err(SteelError::InvalidUnlockTime.into());
        }

        vault.unlock_time = unlock_time;
    }

    if let Some(unlock_amount) = unlock_amount {
        if unlock_amount == 0 {
            return Err(SteelError::InvalidUnlockAmount.into());
        }

        vault.unlock_amount = unlock_amount;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds =
         [b"vault", authority.key().as_ref()], has_one = authority, bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn update(
    ctx: Context<Update>,
    unlock_time: Option<i64>,
    unlock_amount: Option<u64>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    // Can't update an active vault.
    if vault.active {
        return Err(SteelError::VaultActive.into());
    }

    vault.unlock_amount = 0;
    vault.unlock_time = 0;

    if let Some(unlock_time) = unlock_time {
        if unlock_time < clock.unix_timestamp {
            return Err(SteelError::InvalidUnlockTime.into());
        }

        vault.unlock_time = unlock_time;
    }

    if let Some(unlock_amount) = unlock_amount {
        if unlock_amount == 0 {
            return Err(SteelError::InvalidUnlockAmount.into());
        }

        vault.unlock_amount = unlock_amount;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct Activate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds =
         [b"vault", authority.key().as_ref()], has_one = authority, bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn activate(ctx: Context<Activate>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    // At least one condition must be set.
    if vault.unlock_amount == 0 && vault.unlock_time == 0 {
        return Err(SteelError::MissingCondition.into());
    }

    vault.active = true;

    Ok(())
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: This is only used to send lamports to from the closed vault.
    #[account(mut)]
    pub withdraw_address: AccountInfo<'info>,

    #[account(
        mut,
        seeds =
         [b"vault", authority.key().as_ref()], has_one = authority, bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn close(ctx: Context<Close>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let withdraw_address = &mut ctx.accounts.withdraw_address;
    let clock = Clock::get()?;
    let vault_balance = **vault.to_account_info().lamports.borrow();

    // Inactive vaults can be closed with no checks other than has_one for the PDA account.
    // Active vaults can only be closed if at least one of the conditions is met.

    if vault.active {
        if vault.unlock_time != 0 {
            if clock.unix_timestamp >= vault.unlock_time {
                close_vault(vault, withdraw_address);
                return Ok(());
            }
        }
        if vault.unlock_amount != 0 {
            if vault.unlock_amount < vault_balance {
                close_vault(vault, withdraw_address);
                return Ok(());
            }
        }
    } else {
        // Ok to close vault if it's not active.
        close_vault(vault, withdraw_address);
        return Ok(());
    }

    return Err(SteelError::FailedToCloseVault.into());
}

fn close_vault<'info>(vault: &mut Account<Vault>, withdraw_address: &mut AccountInfo) {
    let vault_account = vault.to_account_info();
    let withdraw_amount = **vault_account.lamports.borrow();
    **vault_account.lamports.borrow_mut() = 0;
    sol_memset(&mut *vault_account.data.borrow_mut(), 0, VAULT_SPACE);

    **withdraw_address.lamports.borrow_mut() += withdraw_amount;
}
