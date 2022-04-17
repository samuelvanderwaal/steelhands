import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { expect } from "chai";
const { PublicKey } = anchor.web3;
import { Steelhands } from "../target/types/steelhands";
import BN from "bn.js";

const ONE_SOL = new BN(1_000_000_000);
const TS = new BN(1652793862);

describe("steelhands", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local());

  const program = anchor.workspace.Steelhands as Program<Steelhands>;
  const programId = new anchor.web3.PublicKey(
    "GJbHi5bV138ruTeHUWKLSV53HK57P7JNVFNcBXyPWc1L"
  );

  const authority = new PublicKey(
    "Dn5Pq1Nus6Wt1Lw8rLuH7XgMfRUKxXzMR9BEta45TzAs"
  );

  it("Is initialized!", async () => {
    // Add your test here.
    let seeds = [Buffer.from("vault"), authority.toBytes()];
    let [vault, _] = await PublicKey.findProgramAddress(seeds, programId);

    const tx = await program.methods
      .initialize(TS, ONE_SOL)
      .accounts({
        authority,
        vault
      })
      .signers([])
      .rpc();
    console.log("Your transaction signature", tx);

    let vaultState = await program.account.vault.fetch(vault);
    expect(vaultState.authority.toString()).to.equal(authority.toString());
    expect(vaultState.unlockAmount.toNumber()).to.equal(ONE_SOL.toNumber());
    expect(vaultState.unlockTime.toNumber()).to.equal(TS.toNumber());
    expect(vaultState.active).to.be.false;
  });
});
