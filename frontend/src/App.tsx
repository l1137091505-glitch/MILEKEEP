import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, EXPLORER, readContract, writeContract } from "./chain";

type View = "board" | "new" | "lookup";
type Notice = { kind: "info" | "ok" | "error"; text: string; hash?: string };
type Vault = {
  id: bigint; owner: string; unlockAt: bigint; closed: boolean; exitedEarly: boolean;
  goal: bigint; principal: bigint; reward: bigint; label: string; unlocked: boolean;
};

type RawVault = {
  owner: string; unlockAt: bigint; closed: boolean; exitedEarly: boolean;
  goal: bigint; principal: bigint; storedReward: bigint; rewardDebt: bigint; label: string;
};

const demoVaults: Vault[] = [
  { id: 12n, owner: "0x7a02…c811", unlockAt: BigInt(Math.floor(Date.now()/1000)+86400*18), closed:false, exitedEarly:false, goal:ethers.parseEther("2"), principal:ethers.parseEther("1.34"), reward:ethers.parseEther("0.026"), label:"Studio upgrade", unlocked:false },
  { id: 9n, owner: "0x31ef…09b2", unlockAt: BigInt(Math.floor(Date.now()/1000)-120), closed:false, exitedEarly:false, goal:0n, principal:ethers.parseEther("0.82"), reward:ethers.parseEther("0.014"), label:"Emergency runway", unlocked:true },
  { id: 5n, owner: "0x5d19…ab44", unlockAt: BigInt(Math.floor(Date.now()/1000)+86400*44), closed:false, exitedEarly:false, goal:ethers.parseEther("4"), principal:ethers.parseEther("2.1"), reward:ethers.parseEther("0.031"), label:"Winter flight", unlocked:false }
];

const short = (a: string) => a.length > 12 ? `${a.slice(0,6)}…${a.slice(-4)}` : a;
const bot = (v: bigint, digits = 4) => Number(ethers.formatEther(v)).toLocaleString(undefined,{maximumFractionDigits:digits});
const dateInput = () => { const d=new Date(Date.now()+86400*30*1000); return d.toISOString().slice(0,10); };

function App() {
  const [view,setView]=useState<View>("board");
  const [account,setAccount]=useState("");
  const [walletOpen,setWalletOpen]=useState(false);
  const [vaults,setVaults]=useState<Vault[]>([]);
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState<Notice|null>(null);
  const [stats,setStats]=useState({ count:0n, active:0n, locked:0n, rewards:0n, shared:0n });
  const [lookupId,setLookupId]=useState("");
  const [lookupResult,setLookupResult]=useState<Vault|null>(null);
  const isDemo=!CONTRACT_ADDRESS;

  const loadVault = useCallback(async(id: bigint) => {
    const contract=readContract(); if(!contract) return null;
    const result=await contract.vault(id);
    const data=result[0] as RawVault;
    return { id, owner:data.owner, unlockAt:data.unlockAt, closed:data.closed, exitedEarly:data.exitedEarly, goal:data.goal, principal:data.principal, reward:result[1], label:data.label, unlocked:result[2] } as Vault;
  },[]);

  const refresh=useCallback(async()=>{
    const contract=readContract();
    if(!contract){ setVaults(demoVaults); setStats({count:12n,active:8n,locked:ethers.parseEther("18.42"),rewards:ethers.parseEther("0.37"),shared:ethers.parseEther("1.26")}); return; }
    setLoading(true);
    try{
      const [count,active,locked,rewards,shared]=await Promise.all([contract.vaultCount(),contract.activeVaultCount(),contract.totalLocked(),contract.totalRewardPaid(),contract.totalPenaltyShared()]);
      setStats({count,active,locked,rewards,shared});
      let ids: bigint[]=[];
      if(account) ids=await contract.vaultsOf(account);
      if(!ids.length){ const start=count>10n?count-9n:1n; for(let i=count;i>=start&&i>0n;i--) ids.push(i); }
      const loaded=(await Promise.all(ids.slice(0,12).map(loadVault))).filter(Boolean) as Vault[];
      setVaults(loaded);
    }catch(e){ setNotice({kind:"error",text:messageOf(e)}); }
    finally{ setLoading(false); }
  },[account,loadVault]);

  useEffect(()=>{ refresh(); },[refresh]);
  useEffect(()=>{
    if(!window.ethereum) return;
    window.ethereum.request({method:"eth_accounts"}).then(v=>setAccount(((v as string[])[0]||""))).catch(()=>{});
    const changed=(v:unknown)=>{ setAccount(((v as string[])[0]||"")); setNotice(null); };
    const chain=()=>{ setNotice(null); refresh(); };
    window.ethereum.on?.("accountsChanged",changed); window.ethereum.on?.("chainChanged",chain);
    return()=>{ window.ethereum?.removeListener?.("accountsChanged",changed); window.ethereum?.removeListener?.("chainChanged",chain); };
  },[refresh]);

  const connect=async()=>{
    if(!window.ethereum){ setNotice({kind:"error",text:"Install MetaMask or another browser wallet first."}); return; }
    try{ const accounts=await window.ethereum.request({method:"eth_requestAccounts"}) as string[]; setAccount(accounts[0]||""); }
    catch(e){ setNotice({kind:"error",text:messageOf(e)}); }
  };

  const send=async(label:string,action:(c:ethers.Contract)=>Promise<ethers.ContractTransactionResponse>)=>{
    setLoading(true); setNotice({kind:"info",text:`Confirm “${label}” in your wallet.`});
    try{ const contract=await writeContract(); const tx=await action(contract); setNotice({kind:"info",text:"Transaction submitted. Waiting for confirmation…",hash:tx.hash}); await tx.wait(); setNotice({kind:"ok",text:`${label} confirmed.`,hash:tx.hash}); await refresh(); return true; }
    catch(e){ setNotice({kind:"error",text:messageOf(e)}); return false; }
    finally{ setLoading(false); }
  };

  const shown=useMemo(()=>vaults.filter(v=>!v.closed),[vaults]);

  return <div className="app">
    <aside className="rail">
      <button className="brand" onClick={()=>setView("board")} aria-label="Milekeep home"><span>MK</span><b>MILE<br/>KEEP</b></button>
      <nav>
        <Nav n="01" label="Checkpoint board" active={view==="board"} onClick={()=>setView("board")}/>
        <Nav n="02" label="New checkpoint" active={view==="new"} onClick={()=>setView("new")}/>
        <Nav n="03" label="Find a vault" active={view==="lookup"} onClick={()=>setView("lookup")}/>
      </nav>
      <div className="rail-foot"><i></i><span>BOT CHAIN<br/>NETWORK 677</span></div>
    </aside>

    <main>
      <header className="topbar">
        <div><span className="index">MILEKEEP / {view.toUpperCase()}</span><span className="rule"></span><span className="live">LIVE LEDGER</span></div>
        <div className="wallet-wrap">
          {account ? <button className="wallet" onClick={()=>setWalletOpen(!walletOpen)}><i></i>{short(account)}<span>⌄</span></button> : <button className="wallet connect" onClick={connect}>CONNECT WALLET ↗</button>}
          {walletOpen&&<div className="wallet-menu"><b>{short(account)}</b><button onClick={()=>{setWalletOpen(false);connect();}}>Switch wallet</button><a href={`${EXPLORER}/address/${account}`} target="_blank" rel="noreferrer">View on explorer ↗</a></div>}
        </div>
      </header>

      {isDemo&&<div className="demo"><b>PREVIEW LEDGER</b><span>Deploy Milekeep.sol and set <code>VITE_MILEKEEP_ADDRESS</code> for live data.</span></div>}
      {notice&&<div className={`notice ${notice.kind}`}><span>{notice.text}</span>{notice.hash&&<a href={`${EXPLORER}/tx/${notice.hash}`} target="_blank" rel="noreferrer">VIEW TX ↗</a>}<button onClick={()=>setNotice(null)}>×</button></div>}

      {view==="board"&&<Board stats={stats} vaults={shown} account={account} loading={loading} onNew={()=>setView("new")} onConnect={connect} onSend={send}/>} 
      {view==="new"&&<NewVault loading={loading} account={account} onConnect={connect} onSend={send} onDone={()=>setView("board")}/>} 
      {view==="lookup"&&<section className="page lookup-page">
        <div className="section-no">03 / VAULT INDEX</div><h1>Trace one<br/><em>checkpoint.</em></h1>
        <form className="lookup" onSubmit={async e=>{e.preventDefault(); if(!lookupId)return; setLoading(true); try{setLookupResult(await loadVault(BigInt(lookupId)));}catch(err){setNotice({kind:"error",text:messageOf(err)});}finally{setLoading(false);}}}>
          <label>VAULT NUMBER<input value={lookupId} onChange={e=>setLookupId(e.target.value.replace(/\D/g,""))} placeholder="e.g. 12" inputMode="numeric"/></label><button disabled={loading||!lookupId}>FIND RECORD →</button>
        </form>{lookupResult&&<VaultCard vault={lookupResult} account={account} loading={loading} onSend={send}/>} 
      </section>}
    </main>
  </div>;
}

function Nav({n,label,active,onClick}:{n:string;label:string;active:boolean;onClick:()=>void}){return <button className={active?"active":""} onClick={onClick}><small>{n}</small><span>{label}</span><b>→</b></button>}

function Board({stats,vaults,account,loading,onNew,onConnect,onSend}:{stats:{count:bigint;active:bigint;locked:bigint;rewards:bigint;shared:bigint};vaults:Vault[];account:string;loading:boolean;onNew:()=>void;onConnect:()=>void;onSend:(l:string,a:(c:ethers.Contract)=>Promise<ethers.ContractTransactionResponse>)=>Promise<boolean>}){
  return <section className="page board">
    <div className="mast">
      <div><div className="section-no">01 / SAVINGS CONTROL BOARD</div><h1>Keep the<br/><em>milestone.</em></h1><p>Lock native BOT against a date or target. Leave early and 10% moves to the savers who remain.</p></div>
      <button className="new-button" onClick={onNew}><span>＋</span> OPEN CHECKPOINT <b>↗</b></button>
    </div>
    <div className="ticker"><span>PATIENCE POOL</span><b>{bot(stats.locked,3)} BOT</b><i></i><span>ACTIVE</span><b>{stats.active.toString().padStart(2,"0")}</b><i></i><span>SHARED</span><b>{bot(stats.shared,3)} BOT</b></div>
    <div className="board-grid">
      <div className="ledger-title"><span>ACTIVE CHECKPOINTS</span><b>{vaults.length.toString().padStart(2,"0")}</b></div>
      <div className="ledger">
        {vaults.length? vaults.map(v=><VaultCard key={v.id.toString()} vault={v} account={account} loading={loading} onSend={onSend}/>):<div className="empty"><b>NO CHECKPOINTS YET</b><span>Open the first record to begin.</span></div>}
      </div>
      <aside className="side-metrics">
        <div className="metric cobalt"><span>TOTAL<br/>RECORDS</span><b>{stats.count.toString().padStart(2,"0")}</b><small>ON-CHAIN</small></div>
        <div className="metric coral"><span>REWARDS<br/>COLLECTED</span><b>{bot(stats.rewards,2)}</b><small>BOT</small></div>
        <div className="principle"><b>THE RULE</b><p>Reach the date or the target: collect principal + bonus.</p><p>Leave early: 90% returns, 10% rewards active vaults.</p></div>
        {!account&&<button className="connect-card" onClick={onConnect}>CONNECT WALLET<br/><span>TO VIEW YOUR RECORDS →</span></button>}
      </aside>
    </div>
  </section>
}

function VaultCard({vault,account,loading,onSend}:{vault:Vault;account:string;loading:boolean;onSend:(l:string,a:(c:ethers.Contract)=>Promise<ethers.ContractTransactionResponse>)=>Promise<boolean>}){
  const [amount,setAmount]=useState(""); const mine=account&&vault.owner.toLowerCase()===account.toLowerCase();
  const pct=vault.goal>0n?Math.min(100,Number(vault.principal*10000n/vault.goal)/100):null;
  const deadline=new Date(Number(vault.unlockAt)*1000);
  const add=()=>{if(!amount)return; onSend("Add to checkpoint",c=>c.addToVault(vault.id,{value:ethers.parseEther(amount)})).then(ok=>ok&&setAmount(""));};
  return <article className={`vault ${vault.unlocked?"ready":""}`}>
    <div className="vault-id"><span>MK / {vault.id.toString().padStart(4,"0")}</span><b>{vault.unlocked?"READY":"LOCKED"}</b></div>
    <div className="vault-main"><div><small>CHECKPOINT</small><h3>{vault.label}</h3><p>OWNER {short(vault.owner)}</p></div><div className="dial"><span style={{"--p":`${pct??62}%`} as React.CSSProperties}></span><b>{pct===null?"DATE":`${Math.floor(pct)}%`}</b></div></div>
    <div className="numbers"><div><span>LOCKED</span><b>{bot(vault.principal)}</b><small>BOT</small></div><div><span>BONUS</span><b>+{bot(vault.reward,6)}</b><small>BOT</small></div><div><span>OPENS</span><b>{vault.unlocked?"NOW":deadline.toLocaleDateString(undefined,{month:"short",day:"2-digit"})}</b><small>{deadline.getFullYear()}</small></div></div>
    <div className="vault-actions"><div className="add"><input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00 BOT" inputMode="decimal"/><button disabled={loading||!amount} onClick={add}>ADD</button></div>
      {mine&&vault.unlocked&&<button className="primary" disabled={loading} onClick={()=>onSend("Withdraw checkpoint",c=>c.withdraw(vault.id))}>WITHDRAW ALL →</button>}
      {mine&&!vault.unlocked&&<button className="break" disabled={loading} onClick={()=>{if(confirm("Exit early? 10% of principal and all accrued bonus will be redistributed.")) onSend("Exit early",c=>c.exitEarly(vault.id));}}>EXIT EARLY (−10%)</button>}
    </div>
  </article>
}

function NewVault({loading,account,onConnect,onSend,onDone}:{loading:boolean;account:string;onConnect:()=>void;onSend:(l:string,a:(c:ethers.Contract)=>Promise<ethers.ContractTransactionResponse>)=>Promise<boolean>;onDone:()=>void}){
  const [label,setLabel]=useState(""); const [amount,setAmount]=useState(""); const [goal,setGoal]=useState(""); const [date,setDate]=useState(dateInput());
  const submit=async(e:FormEvent)=>{e.preventDefault(); if(!account){onConnect();return;} const unlock=Math.floor(new Date(`${date}T23:59:59`).getTime()/1000); const ok=await onSend("Open checkpoint",c=>c.openVault(label,unlock,goal?ethers.parseEther(goal):0n,{value:ethers.parseEther(amount)})); if(ok)onDone();};
  return <section className="page new-page"><div className="new-layout"><div className="new-copy"><div className="section-no">02 / NEW CHECKPOINT</div><h1>Give your<br/>money a <em>finish line.</em></h1><p>A checkpoint unlocks when its date arrives or its optional target is reached—whichever comes first.</p><div className="steps"><span><b>1</b>Name the milestone</span><span><b>2</b>Choose date + target</span><span><b>3</b>Lock the first BOT</span></div></div>
    <form className="ticket" onSubmit={submit}><div className="ticket-head"><span>NEW SAVINGS RECORD</span><b>MK / PENDING</b></div>
      <label>CHECKPOINT NAME<input maxLength={48} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Emergency runway" required/></label>
      <div className="form-row"><label>FIRST DEPOSIT<input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.10" inputMode="decimal" required/><small>BOT</small></label><label>OPTIONAL TARGET<input value={goal} onChange={e=>setGoal(e.target.value)} placeholder="2.00" inputMode="decimal"/><small>BOT</small></label></div>
      <label>UNLOCK DATE<input type="date" min={new Date(Date.now()+86400000).toISOString().slice(0,10)} value={date} onChange={e=>setDate(e.target.value)} required/></label>
      <div className="terms"><b>EARLY EXIT RULE</b><span>90% returns to you. 10% + earned bonus is distributed to active vaults.</span></div>
      <button className="issue" disabled={loading||!label||!amount}>{account?"ISSUE CHECKPOINT →":"CONNECT WALLET →"}</button>
    </form></div></section>
}

function messageOf(error:unknown){ const text=(error as {shortMessage?:string;reason?:string;message?:string})?.shortMessage||(error as {reason?:string})?.reason||(error as {message?:string})?.message||"Something went wrong."; if(/user rejected|denied|cancelled/i.test(text))return "You cancelled the request in your wallet."; if(/insufficient funds/i.test(text))return "This wallet does not have enough BOT for the value and gas."; return text.replace(/^execution reverted:\s*/i,""); }

export default App;