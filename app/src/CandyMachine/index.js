import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, Provider, web3 } from '@project-serum/anchor';
import { MintLayout, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { sendTransactions } from './connection';
import './CandyMachine.css';
import CountdownTimer from '../CountdownTimer';
import {
  candyMachineProgram,
  TOKEN_METADATA_PROGRAM_ID,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  getAtaForMint,
  getNetworkExpire,
  getNetworkToken,
  CIVIC
} from './helpers';

const { SystemProgram } = web3;
const opts = {
  preflightCommitment: 'processed',
};

const CandyMachine = ({ walletAddress }) => {
  const [machineStats, setMachineStats] = useState(null);
  const [candyMachine, setCandyMachine] = useState();
  const [isMinting, setIsMinting] = useState(false);
  
  const wallet = useMemo(() => {
    if(
      !walletAddress ||
      !walletAddress.publicKey ||
      !walletAddress.signAllTransactions ||
      !walletAddress.signTransaction
    ){
      return;
    }

    return {
      publicKey: walletAddress.publicKey,
      signAllTransactions: walletAddress.signAllTransactions,
      signTransaction: walletAddress.signTransaction,
    }
  }, [walletAddress]);

  const getCandyMachineCreator = async (candyMachine) => {
    const candyMachineID = new PublicKey(candyMachine);
    return await web3.PublicKey.findProgramAddress(
        [Buffer.from('candy_machine'), candyMachineID.toBuffer()],
        candyMachineProgram,
    );
  };

  const getMetadata = async (mint) => {
    return (
      await PublicKey.findProgramAddress(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )
    )[0];
  };

  const getMasterEdition = async (mint) => {
    return (
      await PublicKey.findProgramAddress(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
          Buffer.from('edition'),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )
    )[0];
  };

  const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress,
    payer,
    walletAddress,
    splTokenMintAddress
  ) => {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: false, isWritable: false },
      { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new web3.TransactionInstruction({
      keys,
      programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      data: Buffer.from([]),
    });
  };

  const getProvider = () => {
    const rpcHost = process.env.REACT_APP_SOLANA_RPC_HOST;
    // Create a new connection object
    const connection = new Connection(rpcHost);
    
    // Create a new Solana provider object
    const provider = new Provider(
      connection,
      window.solana,
      opts.preflightCommitment
    );
  
    return provider;
  };
  
  // Create render function
  const renderDropTimer = () => {
    // Get the current date and dropDate in a JavaScript Date object
    const currentDate = new Date();
    const dropDate = new Date(machineStats.goLiveData * 1000);

    // If currentDate is before dropDate, render our Countdown component
    if (currentDate < dropDate) {
      console.log('Before drop date!');
      // Don't forget to pass over your dropDate!
      return <CountdownTimer dropDate={dropDate} />;
    }
    
    // Else let's just return the current drop date
    return <p>{`Drop Date: ${machineStats.goLiveDateTimeString}`}</p>;
  };

  const getCandyMachineState = async () => {
    const provider = getProvider();
    
    // Get metadata about your deployed candy machine program
    const idl = await Program.fetchIdl(candyMachineProgram, provider);

    // Create a program that you can call
    const program = new Program(idl, candyMachineProgram, provider);
  
    const state = await program.account.candyMachine.fetch(
      process.env.REACT_APP_CANDY_MACHINE_ID
    );
    const itemsAvailable = state.data.itemsAvailable.toNumber();
    const itemsRedeemed = state.itemsRedeemed.toNumber();
    const itemsRemaining = itemsAvailable - itemsRedeemed;
    const goLiveData = state.data.goLiveDate.toNumber();

    const presale =
      state.data.whitelistMintSettings &&
      state.data.whitelistMintSettings.presale &&
      (!state.data.goLiveDate ||
        state.data.goLiveDate.toNumber() > new Date().getTime() / 1000);
    
    // We will be using this later in our UI so let's generate this now
    const goLiveDateTimeString = `${new Date(
      goLiveData * 1000
    ).toLocaleDateString()} @ ${new Date(
      goLiveData * 1000
    ).toLocaleTimeString()}`;

    // Add this data to your state to render
    setMachineStats({
      itemsAvailable,
      itemsRedeemed,
      itemsRemaining,
      goLiveData,
      goLiveDateTimeString,
      presale,
    });
    
    console.log({
      itemsAvailable,
      itemsRedeemed,
      itemsRemaining,
      goLiveData,
      goLiveDateTimeString,
      presale,
    });

    return {
      id: process.env.REACT_APP_CANDY_MACHINE_ID,
      program,
      state: {
        itemsAvailable,
        itemsRedeemed,
        itemsRemaining,
        isSoldOut: itemsRemaining === 0,
        isActive:
          (presale ||
            state.data.goLiveDate.toNumber() < new Date().getTime() / 1000) &&
          (state.endSettings
            ? state.endSettings.endSettingType.date
              ? state.endSettings.number.toNumber() > new Date().getTime() / 1000
              : itemsRedeemed < state.endSettings.number.toNumber()
            : true),
        isPresale: presale,
        goLiveDate: state.data.goLiveDate,
        treasury: state.wallet,
        tokenMint: state.tokenMint,
        gatekeeper: state.data.gatekeeper,
        endSettings: state.data.endSettings,
        whitelistMintSettings: state.data.whitelistMintSettings,
        hiddenSettings: state.data.hiddenSettings,
        price: state.data.price,
      },
    };
  };

  const refreshCandyMachineState = useCallback(async () => {
    if (!wallet) {
      return;
    }

    if (process.env.REACT_APP_CANDY_MACHINE_ID){
      try{
        const cndy = await getCandyMachineState();
        setCandyMachine(cndy);
      }
      catch(e){
        console.log('There was a problem fetching candy machine state', e);
        console.log(e);
      }
    }
  }, [wallet]);

  const mintToken = async () => {
    setIsMinting(true);
    const mint = web3.Keypair.generate();

    const userTokenAccountAddress = (
      await getAtaForMint(mint.publicKey, walletAddress.publicKey)
    )[0];
  
    const userPayingAccountAddress = candyMachine.state.tokenMint
      ? (await getAtaForMint(candyMachine.state.tokenMint, walletAddress.publicKey))[0]
      : walletAddress.publicKey;
  
    const candyMachineAddress = candyMachine.id;
    const remainingAccounts = [];
    const signers = [mint];
    const cleanupInstructions = [];
    const instructions = [
      web3.SystemProgram.createAccount({
        fromPubkey: walletAddress.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MintLayout.span,
        lamports:
          await candyMachine.program.provider.connection.getMinimumBalanceForRentExemption(
            MintLayout.span,
          ),
        programId: TOKEN_PROGRAM_ID,
      }),
      Token.createInitMintInstruction(
        TOKEN_PROGRAM_ID,
        mint.publicKey,
        0,
        walletAddress.publicKey,
        walletAddress.publicKey,
      ),
      createAssociatedTokenAccountInstruction(
        userTokenAccountAddress,
        walletAddress.publicKey,
        walletAddress.publicKey,
        mint.publicKey,
      ),
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        mint.publicKey,
        userTokenAccountAddress,
        walletAddress.publicKey,
        [],
        1,
      ),
    ];
  
    if (candyMachine.state.gatekeeper) {
      remainingAccounts.push({
        pubkey: (
          await getNetworkToken(
            walletAddress.publicKey,
            candyMachine.state.gatekeeper.gatekeeperNetwork,
          )
        )[0],
        isWritable: true,
        isSigner: false,
      });
      if (candyMachine.state.gatekeeper.expireOnUse) {
        remainingAccounts.push({
          pubkey: CIVIC,
          isWritable: false,
          isSigner: false,
        });
        remainingAccounts.push({
          pubkey: (
            await getNetworkExpire(
              candyMachine.state.gatekeeper.gatekeeperNetwork,
            )
          )[0],
          isWritable: false,
          isSigner: false,
        });
      }
    }
    if (candyMachine.state.whitelistMintSettings) {
      const mint = new web3.PublicKey(
        candyMachine.state.whitelistMintSettings.mint,
      );
  
      const whitelistToken = (await getAtaForMint(mint, walletAddress.publicKey))[0];
      remainingAccounts.push({
        pubkey: whitelistToken,
        isWritable: true,
        isSigner: false,
      });
  
      if (candyMachine.state.whitelistMintSettings.mode.burnEveryTime) {
        const whitelistBurnAuthority = web3.Keypair.generate();
  
        remainingAccounts.push({
          pubkey: mint,
          isWritable: true,
          isSigner: false,
        });
        remainingAccounts.push({
          pubkey: whitelistBurnAuthority.publicKey,
          isWritable: false,
          isSigner: true,
        });
        signers.push(whitelistBurnAuthority);
        const exists =
          await candyMachine.program.provider.connection.getAccountInfo(
            whitelistToken,
          );
        if (exists) {
          instructions.push(
            Token.createApproveInstruction(
              TOKEN_PROGRAM_ID,
              whitelistToken,
              whitelistBurnAuthority.publicKey,
              walletAddress.publicKey,
              [],
              1,
            ),
          );
          cleanupInstructions.push(
            Token.createRevokeInstruction(
              TOKEN_PROGRAM_ID,
              whitelistToken,
              walletAddress.publicKey,
              [],
            ),
          );
        }
      }
    }
  
    if (candyMachine.state.tokenMint) {
      const transferAuthority = web3.Keypair.generate();
  
      signers.push(transferAuthority);
      remainingAccounts.push({
        pubkey: userPayingAccountAddress,
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({
        pubkey: transferAuthority.publicKey,
        isWritable: false,
        isSigner: true,
      });
  
      instructions.push(
        Token.createApproveInstruction(
          TOKEN_PROGRAM_ID,
          userPayingAccountAddress,
          transferAuthority.publicKey,
          walletAddress.publicKey,
          [],
          candyMachine.state.price.toNumber(),
        ),
      );
      cleanupInstructions.push(
        Token.createRevokeInstruction(
          TOKEN_PROGRAM_ID,
          userPayingAccountAddress,
          walletAddress.publicKey,
          [],
        ),
      );
    }
    const metadataAddress = await getMetadata(mint.publicKey);
    const masterEdition = await getMasterEdition(mint.publicKey);
  
    const [candyMachineCreator, creatorBump] = await getCandyMachineCreator(
      candyMachineAddress,
    );
  
    instructions.push(
      await candyMachine.program.instruction.mintNft(creatorBump, {
        accounts: {
          candyMachine: candyMachineAddress,
          candyMachineCreator,
          payer: walletAddress.publicKey,
          wallet: candyMachine.state.treasury,
          mint: mint.publicKey,
          metadata: metadataAddress,
          masterEdition,
          mintAuthority: walletAddress.publicKey,
          updateAuthority: walletAddress.publicKey,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
          recentBlockhashes: web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
          instructionSysvarAccount: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        },
        remainingAccounts:
          remainingAccounts.length > 0 ? remainingAccounts : undefined,
      }),
    );
  
    try {
      setIsMinting(false);
      return (
        await sendTransactions(
          candyMachine.program.provider.connection,
          candyMachine.program.provider.wallet,
          [instructions, cleanupInstructions],
          [signers, []],
        )
      ).txs.map(t => t.txid);
    } catch (e) {
      console.log(e);
    }
    setIsMinting(false);
    return [];
  };
  
  useEffect(() => {
    refreshCandyMachineState();
  }, [wallet, refreshCandyMachineState]);

  return (
    machineStats && (
      <div className="machine-container">
        {renderDropTimer()}
        <p>{`Items Minted: ${machineStats.itemsRedeemed} / ${machineStats.itemsAvailable}`}</p>
        {/* Check to see if these properties are equal! */}
        {machineStats.itemsRedeemed === machineStats.itemsAvailable ? (
          <p className="sub-text">Sold Out 🙊</p>
        ) : (
          <button
            className="cta-button mint-button"
            onClick={mintToken}
            disabled={isMinting}
          >
            Mint NFT
          </button>
        )}
      </div>
    )
  );
};

export default CandyMachine;
