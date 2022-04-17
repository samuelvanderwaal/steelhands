import * as anchor from "@project-serum/anchor";
import { AnchorError, Program } from "@project-serum/anchor";
import { expect } from "chai";
const { Keypair, PublicKey } = anchor.web3;
import { Steelhands } from "../target/types/steelhands";
import BN from "bn.js";

const ONE_SOL = new BN(1_000_000_000);
const TS = new BN(1681788581);

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.local());

const program = anchor.workspace.Steelhands as Program<Steelhands>;
const programId = new anchor.web3.PublicKey(
  "GJbHi5bV138ruTeHUWKLSV53HK57P7JNVFNcBXyPWc1L"
);

const authority = new PublicKey("Dn5Pq1Nus6Wt1Lw8rLuH7XgMfRUKxXzMR9BEta45TzAs");

describe("steelhands", () => {
  it("Is initialized!", async () => {
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
      await close(program, authority);
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
  authority: anchor.web3.Keypair
): Promise<string> {
  let vault = await findVaultPDA(authority.publicKey);

  const tx = await program.methods
    .close()
    .accounts({
      authority: authority.publicKey,
      withdrawAddress: authority.publicKey,
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
