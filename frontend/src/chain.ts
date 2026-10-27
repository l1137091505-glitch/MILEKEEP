import { ethers } from "ethers";

export const CHAIN_ID = 677;
export const CHAIN_HEX = "0x2A5";
export const RPC_URL = "https://rpc.botchain.ai";
export const EXPLORER = "https://scan.botchain.ai";
export const CONTRACT_ADDRESS = (import.meta.env.VITE_MILEKEEP_ADDRESS || "").trim();

export const ABI = [
  "function vaultCount() view returns (uint256)",
  "function activeVaultCount() view returns (uint256)",
  "function totalLocked() view returns (uint256)",
  "function totalRewardPaid() view returns (uint256)",
  "function totalPenaltyShared() view returns (uint256)",
  "function vaultsOf(address owner) view returns (uint256[])",
  "function vault(uint256 vaultId) view returns ((address owner,uint64 unlockAt,bool closed,bool exitedEarly,uint256 goal,uint256 principal,uint256 storedReward,uint256 rewardDebt,string label) data,uint256 pendingReward,bool unlocked)",
  "function openVault(string label,uint64 unlockAt,uint256 goal) payable returns (uint256 vaultId)",
  "function addToVault(uint256 vaultId) payable",
  "function withdraw(uint256 vaultId)",
  "function exitEarly(uint256 vaultId)"
];

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global { interface Window { ethereum?: EthereumProvider } }

export async function ensureBotChain() {
  if (!window.ethereum) throw new Error("Install a wallet extension first.");
  const current = await window.ethereum.request({ method: "eth_chainId" }) as string;
  if (current.toLowerCase() === CHAIN_HEX.toLowerCase()) return;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
      chainId: CHAIN_HEX, chainName: "BOT Chain", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
      rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER]
    }] });
  }
}

export function readContract() {
  if (!CONTRACT_ADDRESS) return null;
  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "BOT Chain" });
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
}

export async function writeContract() {
  if (!CONTRACT_ADDRESS) throw new Error("Contract address is not configured.");
  if (!window.ethereum) throw new Error("Install a wallet extension first.");
  await ensureBotChain();
  const provider = new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
}