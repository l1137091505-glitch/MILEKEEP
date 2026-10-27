# MILEKEEP 部署说明

## 一、在 Remix 部署合约

1. 打开 Remix，新建 `Milekeep.sol`。
2. 把 `contracts/src/Milekeep.sol` 的完整内容粘贴进去。
3. Solidity Compiler 选择 `0.8.24`，点击 **Compile Milekeep.sol**。
4. 打开 **Deploy & Run Transactions**。
5. Environment 选择 **Browser Extension / MetaMask**。
6. 确认钱包网络是 BOT Chain（Chain ID 677）。
7. Contract 选择 `Milekeep - Milekeep.sol`，点击 **Deploy**。
8. 在钱包中确认交易；部署完成后复制合约地址。

合约没有构造参数。

## 二、上传 GitHub

把整个 MILEKEEP 项目上传到一个全新的 GitHub 仓库。仓库根目录应该能看到：

- `contracts/`
- `frontend/`
- `README.md`
- `DEPLOY-ZH.md`

## 三、导入 Vercel

1. 在 Vercel 点击 **Add New → Project**，导入 GitHub 仓库。
2. **Root Directory** 选择 `frontend`。
3. Framework Preset 选择 **Vite**（通常会自动识别）。
4. 添加环境变量：
   - Type：Config
   - Key：`VITE_MILEKEEP_ADDRESS`
   - Value：刚刚复制的合约地址
   - Environment：Production
5. 点击 Deploy。

如果项目已经部署过：保存环境变量后点击 **Redeploy**，不要勾选旧 Build Cache。

## 四、交互顺序

1. 点击 `CONNECT WALLET`。
2. 打开 `NEW CHECKPOINT`。
3. 填写名称、首次存入金额、可选目标和解锁日期。
4. 钱包确认后，在控制面板查看记录。
5. 任意钱包都可以在记录卡中填写 BOT 并点击 `ADD` 追加。
6. 到期或达到目标后，所有者点击 `WITHDRAW ALL`。
7. 未解锁时所有者可点击 `EXIT EARLY`，但会扣除 10%，该部分会分给其他活跃储蓄记录。

建议先用很小的 BOT 金额测试。每次链上操作都必须由你在钱包中亲自确认。