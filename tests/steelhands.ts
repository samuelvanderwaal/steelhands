import * as anchor from "@project-serum/anchor";
import { AnchorError, Program } from "@project-serum/anchor";
import { expect } from "chai";
const { Keypair, PublicKey } = anchor.web3;
import { Steelhands } from "../target/types/steelhands";
import BN from "bn.js";

const ONE_SOL = new BN(1_000_000_000);
const TS = new BN(1681788581);

const VAULT_SPACE =
  8 + // Anchor discriminator
  32 + // authority pubkey
  8 + // unlock_time
  8 + // unlock_date
  8; // bump

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.local());
const provider = anchor.getProvider();

const program = anchor.workspace.Steelhands as Program<Steelhands>;
const programId = new anchor.web3.PublicKey(
  "GJbHi5bV138ruTeHUWKLSV53HK57P7JNVFNcBXyPWc1L"
);

const authority = new PublicKey("Dn5Pq1Nus6Wt1Lw8rLuH7XgMfRUKxXzMR9BEta45TzAs");

describe("steelhands", () => {
  it("successfully initializes a vault", async () => {
    let authority = await createNewAuthority();

    const tx = await initialize(program, authority, TS, ONE_SOL);
    console.log("Your transaction signature", tx);

    let vault = await findVaultPDA(authority.publicKey);
    let vaultState = await program.account.vault.fetch(vault);
    expect(vaultState.authority.toString()).to.equal(
      authority.publicKey.toString()
    );
    expect(vaultState.unlockAmount.toNumber()).to.equal(ONE_SOL.toNumber());
    expect(vaultState.unlockTime.toNumber()).to.equal(TS.toNumber());
    expect(vaultState.active).to.be.false;
  });

  it("closes a vault that has hit the time condition", async () => {
    let authority = await createNewAuthority();
    let withdrawAdress = new Keypair().publicKey;
    let vault = await findVaultPDA(authority.publicKey);

    // Timestamp converted to seconds.
    const ts = new BN(Date.now() / 1000 + 3);

    const tx = await initialize(program, authority, ts, ONE_SOL);
    console.log("Your transaction signature", tx);

    const activateTx = await activate(program, authority);
    console.log("Activated vault: ", activateTx);

    // Closing vault should fail.
    try {
      await close(program, authority, withdrawAdress);
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect(err.error.errorCode.code).to.equal("FailedToCloseVault");
      expect(err.error.errorCode.number).to.equal(6006);
    }

    // Wait to meet the time condition.
    await delay(5_000);

    expect(Date.now()).to.be.greaterThan(ts.toNumber());

    // Now we can close the vault.
    await close(program, authority, withdrawAdress);
    await delay(500);

    let vaultRent = await provider.connection.getMinimumBalanceForRentExemption(
      VAULT_SPACE
    );

    let balance = await provider.connection.getBalance(withdrawAdress);
    await delay(500);

    expect(balance).to.equal(vaultRent);
  });

  it("closes a vault that has hit the amount condition", async () => {
    let authority = await createNewAuthority();
    let withdrawAdress = new Keypair().publicKey;
    let vault = await findVaultPDA(authority.publicKey);

    const tx = await initialize(program, authority, TS, ONE_SOL);
    console.log("Your transaction signature", tx);

    const activateTx = await activate(program, authority);
    console.log("Activated vault: ", activateTx);

    // Closing vault should fail.
    try {
      await close(program, authority, withdrawAdress);
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect(err.error.errorCode.code).to.equal("FailedToCloseVault");
      expect(err.error.errorCode.number).to.equal(6006);
    }

    await anchor
      .getProvider()
      .connection.requestAirdrop(authority.publicKey, 2 * ONE_SOL.toNumber());
    await delay(500);

    // Deposit one SOL into the account to meet the amount condition.
    const transferTx = createTransferTx(authority.publicKey, vault, ONE_SOL);
    await provider.connection.sendTransaction(transferTx, [authority]);
    await delay(500);

    // Now we can close the vault.
    const closeTx = await close(program, authority, withdrawAdress);

    // Total amount withdrawn should be vault rent + 1 SOL.
    let vaultRent = await provider.connection.getMinimumBalanceForRentExemption(
      VAULT_SPACE
    );

    let balance = await provider.connection.getBalance(withdrawAdress);
    await delay(500);

    expect(balance).to.equal(ONE_SOL.toNumber() + vaultRent);
  });

  it("closes an an inactive vault", async () => {
    let authority = await createNewAuthority();

    const initTx = await initialize(program, authority, TS, ONE_SOL);
    console.log("Initialized vault:", initTx);

    const closeTx = await close(program, authority, authority.publicKey);
    console.log("Closed vault:", closeTx);
  });

  it("prevents updating an active vault", async () => {
    let authority = await createNewAuthority();

    const initTx = await initialize(program, authority, TS, ONE_SOL);
    console.log("Intialized vault: ", initTx);

    const activateTx = await activate(program, authority);
    console.log("Activated vault: ", activateTx);

    try {
      await update(program, authority, TS, ONE_SOL);
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect(err.error.errorCode.code).to.equal("VaultActive");
      expect(err.error.errorCode.number).to.equal(6003);
    }
  });

  it("prevents closing an active vault", async () => {
    let authority = await createNewAuthority();

    const initTx = await initialize(program, authority, TS, ONE_SOL);
    console.log("Intialized vault: ", initTx);

    const activateTx = await activate(program, authority);
    console.log("Activated vault: ", activateTx);

    try {
      await close(program, authority, authority.publicKey);
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect(err.error.errorCode.code).to.equal("FailedToCloseVault");
      expect(err.error.errorCode.number).to.equal(6006);
    }
  });

  // it("prevents closing an active vault", async () => {});

  // it("prevents closing an active vault", async () => {});
  // it("prevents closing an active vault", async () => {});
  // it("prevents closing an active vault", async () => {});
});

async function initialize(
  program: Program<Steelhands>,
  authority: anchor.web3.Keypair,
  unlockTime: BN,
  unlockAmount: BN
): Promise<string> {
  let vault = await findVaultPDA(authority.publicKey);

  const tx = await program.methods
    .initialize(unlockTime, unlockAmount)
    .accounts({
      authority: authority.publicKey,
      vault
    })
    .signers([authority])
    .rpc();
  return tx;
}

async function update(
  program: Program<Steelhands>,
  authority: anchor.web3.Keypair,
  unlockTime: BN,
  unlockAmount: BN
): Promise<string> {
  let vault = await findVaultPDA(authority.publicKey);

  const tx = await program.methods
    .update(unlockTime, unlockAmount)
    .accounts({
      authority: authority.publicKey,
      vault
    })
    .signers([authority])
    .rpc();
  return tx;
}

async function activate(
  program: Program<Steelhands>,
  authority: anchor.web3.Keypair
): Promise<string> {
  let vault = await findVaultPDA(authority.publicKey);

  const tx = await program.methods
    .activate()
    .accounts({
      authority: authority.publicKey,
      vault
    })
    .signers([authority])
    .rpc();
  return tx;
}

async function close(
  program: Program<Steelhands>,
  authority: anchor.web3.Keypair,
  withdrawAddress: anchor.web3.PublicKey
): Promise<string> {
  let vault = await findVaultPDA(authority.publicKey);

  const tx = await program.methods
    .close()
    .accounts({
      authority: authority.publicKey,
      withdrawAddress,
      vault
    })
    .signers([authority])
    .rpc();
  return tx;
}

async function findVaultPDA(
  authority: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> {
  let seeds = [Buffer.from("vault"), authority.toBytes()];
  let [vault, _] = await PublicKey.findProgramAddress(seeds, programId);
  return vault;
}

async function createNewAuthority(): Promise<anchor.web3.Keypair> {
  let authority = new Keypair();

  await anchor
    .getProvider()
    .connection.requestAirdrop(authority.publicKey, ONE_SOL.toNumber());
  await delay(500);

  return authority;
}

async function delay(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

function createTransferTx(
  from: anchor.web3.PublicKey,
  to: anchor.web3.PublicKey,
  lamports: BN
): anchor.web3.Transaction {
  return new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: lamports.toNumber()
    })
  );
}
