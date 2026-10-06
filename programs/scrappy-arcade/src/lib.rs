use anchor_lang::prelude::*;

declare_id!("DygzrTDfuuM8UYVRHkYvqkpfFN6G4AgnTEHSJYqyFRb2");

/// SCRAPPY BOY arcade program.
///
/// The SAVE CARD is a PDA per player that keeps best score, last score and
/// total runs. The play key signs writes itself, or a delegated session signer
/// writes on the player's behalf once the wallet has issued a scoped, expiring
/// session PDA.
#[program]
pub mod scrappy_arcade {
    use super::*;

    /// The player's own key writes their save card. First write creates it.
    pub fn record_score(ctx: Context<RecordScore>, score: u32) -> Result<()> {
        let card = &mut ctx.accounts.save_card;
        card.player = ctx.accounts.player.key();
        card.bump = ctx.bumps.save_card;
        write_score(card, score)
    }

    /// A session delegate writes on the player's behalf.
    /// The Session PDA must exist, match player + delegate, and be unexpired.
    /// This is the scoped path the game uses after one wallet signature.
    pub fn record_score_as(ctx: Context<RecordScoreAs>, score: u32) -> Result<()> {
        let session = &ctx.accounts.session;
        require_keys_eq!(session.player, ctx.accounts.player.key(), ArcadeError::WrongPlayer);
        require_keys_eq!(session.delegate, ctx.accounts.delegate.key(), ArcadeError::WrongDelegate);
        require!(session.expires_at_slot > Clock::get()?.slot, ArcadeError::SessionExpired);
        // The delegate may be the one that creates the card, so stamp the owner here too;
        // otherwise a card born on this path would read as owned by the zero key.
        let card = &mut ctx.accounts.save_card;
        card.player = ctx.accounts.player.key();
        card.bump = ctx.bumps.save_card;
        write_score(card, score)
    }

    /// The real wallet delegates writes to a device key for a bounded time.
    pub fn authorize_session(ctx: Context<AuthorizeSession>, delegate: Pubkey, ttl_slots: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.player = ctx.accounts.player.key();
        session.delegate = delegate;
        session.expires_at_slot = Clock::get()?.slot + ttl_slots;
        session.bump = ctx.bumps.session;
        Ok(())
    }

    /// The wallet revokes a delegate early; the PDA rent returns to the wallet.
    pub fn revoke_session(ctx: Context<RevokeSession>, delegate: Pubkey) -> Result<()> {
        let session = &ctx.accounts.session;
        require_keys_eq!(session.delegate, delegate, ArcadeError::WrongDelegate);
        Ok(())
    }
}

fn write_score(card: &mut Account<SaveCard>, score: u32) -> Result<()> {
    if score > card.best {
        card.best = score;
    }
    card.last = score;
    card.plays = card.plays.checked_add(1).ok_or(ArcadeError::Overflow)?;
    card.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(Accounts)]
pub struct RecordScore<'info> {
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + SaveCard::INIT_SPACE,
        seeds = [b"save_card", player.key().as_ref()],
        bump,
    )]
    pub save_card: Account<'info, SaveCard>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordScoreAs<'info> {
    #[account(
        init_if_needed,
        payer = delegate,
        space = 8 + SaveCard::INIT_SPACE,
        seeds = [b"save_card", player.key().as_ref()],
        bump,
    )]
    pub save_card: Account<'info, SaveCard>,
    /// CHECK: the player this score belongs to. Not a signer; the session PDA vouches.
    pub player: AccountInfo<'info>,
    #[account(mut)]
    pub delegate: Signer<'info>,
    #[account(
        seeds = [b"session", player.key().as_ref(), delegate.key().as_ref()],
        bump = session.bump,
    )]
    pub session: Account<'info, Session>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(delegate: Pubkey)]
pub struct AuthorizeSession<'info> {
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + Session::INIT_SPACE,
        seeds = [b"session", player.key().as_ref(), delegate.as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(delegate: Pubkey)]
pub struct RevokeSession<'info> {
    #[account(
        mut,
        close = player,
        seeds = [b"session", player.key().as_ref(), delegate.as_ref()],
        bump = session.bump,
    )]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub player: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct SaveCard {
    pub player: Pubkey,
    pub best: u32,
    pub last: u32,
    pub plays: u32,
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub player: Pubkey,
    pub delegate: Pubkey,
    pub expires_at_slot: u64,
    pub bump: u8,
}

#[error_code]
pub enum ArcadeError {
    #[msg("session PDA player does not match")]
    WrongPlayer,
    #[msg("session PDA delegate does not match")]
    WrongDelegate,
    #[msg("session has expired")]
    SessionExpired,
    #[msg("play counter overflowed")]
    Overflow,
}
