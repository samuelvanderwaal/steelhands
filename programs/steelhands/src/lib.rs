use anchor_lang::prelude::*;

mod constants;
mod errors;
mod vault;

pub use constants::*;
pub use errors::*;
pub use vault::*;

declare_id!("GJbHi5bV138ruTeHUWKLSV53HK57P7JNVFNcBXyPWc1L");

#[program]
pub mod steelhands {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        unlock_time: Option<i64>,
        unlock_amount: Option<u64>,
    ) -> Result<()> {
        vault::initialize(ctx, unlock_time, unlock_amount)?;

        Ok(())
    }
}
