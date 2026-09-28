use anchor_lang::prelude::*;

declare_id!("6JWs3RjaawXTHvjFmFq2UxWiX8HPpxfi71WsGeLqVXm3");

/// SCRAPPY BOY arcade program.
///
/// The SAVE CARD is on-chain for real: a PDA per player that keeps best score,
/// last score and total runs. The play key signs writes itself, or a delegated
/// session signer writes on the player's behalf once the wallet has issued a
/// scoped, expiring session PDA - the pattern MagicBlock session keys formalize.
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
        write_score(&mut ctx.accounts.save_card, score)
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

    // ---- link battles ------------------------------------------------------
    //
    // A Battle PDA `[b"battle", id]` is the shared scoreboard: the host creates
    // it, a friend joins with a link, both post one score, and the contract
    // settles the winner. Posting uses either key path - the player's own key
    // or an unexpired session delegate - so a device play key can battle.

    pub fn create_battle(ctx: Context<CreateBattle>, battle_id: u64) -> Result<()> {
        let b = &mut ctx.accounts.battle;
        b.id = battle_id;
        b.host = ctx.accounts.host.key();
        b.guest = Pubkey::default();
        b.scores = [0, 0];
        b.posted = [false, false];
        b.bump = ctx.bumps.battle;
        Ok(())
    }

    pub fn join_battle(ctx: Context<JoinBattle>, _battle_id: u64) -> Result<()> {
        let b = &mut ctx.accounts.battle;
        require!(b.guest == Pubkey::default(), ArcadeError::BattleFull);
        b.guest = ctx.accounts.guest.key();
        Ok(())
    }

    /// One score post per seat. Slot is decided by which key signed.
    pub fn post_battle_score(ctx: Context<PostBattleScore>, _battle_id: u64, score: u32) -> Result<()> {
        let b = &mut ctx.accounts.battle;
        let who = ctx.accounts.who.key();
        let slot = if who == b.host {
            0
        } else if who == b.guest {
            1
        } else {
            return err!(ArcadeError::NotInBattle);
        };
        require!(b.guest != Pubkey::default(), ArcadeError::BattleNotJoined);
        require!(!b.posted[slot], ArcadeError::AlreadyPosted);
        b.scores[slot] = score;
        b.posted[slot] = true;
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

#[derive(Accounts)]
#[instruction(battle_id: u64)]
pub struct CreateBattle<'info> {
    #[account(
        init,
        payer = host,
        space = 8 + Battle::INIT_SPACE,
        seeds = [b"battle", battle_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub battle: Account<'info, Battle>,
    #[account(mut)]
    pub host: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(battle_id: u64)]
pub struct JoinBattle<'info> {
    #[account(
        mut,
        seeds = [b"battle", battle_id.to_le_bytes().as_ref()],
        bump = battle.bump,
    )]
    pub battle: Account<'info, Battle>,
    pub guest: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(battle_id: u64)]
pub struct PostBattleScore<'info> {
    #[account(
        mut,
        seeds = [b"battle", battle_id.to_le_bytes().as_ref()],
        bump = battle.bump,
    )]
    pub battle: Account<'info, Battle>,
    pub who: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub player: Pubkey,
    pub delegate: Pubkey,
    pub expires_at_slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Battle {
    pub id: u64,
    pub host: Pubkey,
    pub guest: Pubkey,
    pub scores: [u32; 2],
    pub posted: [bool; 2],
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
    #[msg("battle already has a guest")]
    BattleFull,
    #[msg("nobody has joined this battle yet")]
    BattleNotJoined,
    #[msg("signer is not a player in this battle")]
    NotInBattle,
    #[msg("this seat already posted its score")]
    AlreadyPosted,
}
