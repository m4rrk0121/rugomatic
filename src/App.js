import { ethers } from 'ethers';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import rugLogo from './Rug.png'; // Make sure the case matches your actual file

// Define the complete Uniswap V3 Router ABI
const SWAP_ROUTER_ABI = [
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "tokenIn",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "tokenOut",
            "type": "address"
          },
          {
            "internalType": "uint24",
            "name": "fee",
            "type": "uint24"
          },
          {
            "internalType": "address",
            "name": "recipient",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amountIn",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amountOutMinimum",
            "type": "uint256"
          },
          {
            "internalType": "uint160",
            "name": "sqrtPriceLimitX96",
            "type": "uint160"
          }
        ],
        "internalType": "struct ISwapRouter.ExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "exactInputSingle",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

// ERC20 Token ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// WETH ABI for unwrapping WETH to ETH
const WETH_ABI = [
  "function withdraw(uint wad) external",
  "function deposit() external payable",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

const EthereumTransferApp = () => {
  // State for the active tab (0 = single key, 1 = multiple keys, 2 = wallet generator, 3 = buy token)
  const [activeTab, setActiveTab] = useState(0);
  
  // Single key tab states
  const [privateKey, setPrivateKey] = useState('');
  const [recipients, setRecipients] = useState(Array(30).fill().map(() => ({ address: '', amount: '' })));
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('');
  
  // Multiple keys tab states
  const [multiKeyTransfers, setMultiKeyTransfers] = useState(Array(30).fill().map(() => ({ 
    privateKey: '', 
    sourceAddress: '',
    destinationAddress: '', 
    amount: '',
    balance: '',
    status: '' 
  })));
  
  // Wallet generator tab states
  const [numWalletsToGenerate, setNumWalletsToGenerate] = useState(5);
  const [generatedWallets, setGeneratedWallets] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Buy token tab states
  const [tokenAddress, setTokenAddress] = useState('');
  const [slippage, setSlippage] = useState(0.5); // Default 0.5%
  const [buyerWallets, setBuyerWallets] = useState(Array(30).fill().map(() => ({
    privateKey: '',
    address: '',
    balance: '',
    ethAmount: '',
    tokenBalance: '0',
    tokenDecimals: 18,
    status: ''
  })));
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({ name: '', symbol: '', decimals: 18 });
  const [isBuying, setIsBuying] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [currentBuyIndex, setCurrentBuyIndex] = useState(null);
  
  // Shared states
  const [network, setNetwork] = useState('base');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [transactionHashes, setTransactionHashes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  
  // Provider reference to avoid recreating it too often
  const providerRef = useRef(null);

  // Networks available for selection
  const networks = {
    base: 'https://mainnet.base.org',
    base_sepolia: 'https://sepolia.base.org',
    mainnet: 'https://eth-mainnet.g.alchemy.com/v2/demo',
    sepolia: 'https://eth-sepolia.g.alchemy.com/v2/demo',
    goerli: 'https://eth-goerli.g.alchemy.com/v2/demo'
  };

  // Constants for Uniswap V3 integration
  const UNISWAP_V3_ROUTER_ADDRESS = {
    base: '0x2626664c2603336E57B271c5C0b26F421741e481', // Base Uniswap V3 Router
    mainnet: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Ethereum Mainnet Uniswap V3 Router
    // Add other networks as needed
  };

  const WETH_ADDRESS = {
    base: '0x4200000000000000000000000000000000000006', // WETH on Base
    mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH on Ethereum
    // Add other networks as needed
  };// Initialize provider when network changes
  useEffect(() => {
    try {
      console.log('Initializing provider for network:', network);
      providerRef.current = new ethers.providers.JsonRpcProvider(networks[network]);
      
      // If we have a wallet address in tab 1, update its balance
      if (walletAddress) {
        console.log('Fetching balance for existing wallet:', walletAddress);
        fetchBalance(walletAddress);
      }
      
      // We don't automatically update balances when network changes
      // User must press "Load All Keys" button
    } catch (err) {
      console.error('Provider initialization error:', err);
      setError('Failed to initialize provider: ' + err.message);
    }
  }, [network]);

  // Helper function to validate an Ethereum address
  const isValidAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Fetch balance for a single wallet
  const fetchBalance = useCallback(async (address) => {
    if (!providerRef.current || !address) return;

    try {
      console.log('Fetching balance for address:', address);
      // Simplified balance request
      const balanceWei = await providerRef.current.getBalance(address, 'latest');
      const balanceEth = ethers.utils.formatEther(balanceWei);
      console.log('Balance fetched:', balanceEth, 'ETH');
      setBalance(balanceEth);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      setError(`Failed to fetch balance: ${err.message}`);
      setBalance('Error');
    }
  }, []);

  // Fetch balance for a wallet in the multi-key tab
  const fetchMultiKeyBalance = async (index) => {
    const transfer = multiKeyTransfers[index];
    if (!providerRef.current || !transfer.sourceAddress) return;

    try {
      console.log('Fetching balance for multi-key wallet at index', index, ':', transfer.sourceAddress);
      // Simplified balance request for multi-key
      const balanceWei = await providerRef.current.getBalance(transfer.sourceAddress, 'latest');
      const balanceEth = ethers.utils.formatEther(balanceWei);
      console.log('Multi-key balance fetched:', balanceEth, 'ETH');
      
      const updatedTransfers = [...multiKeyTransfers];
      updatedTransfers[index] = { ...updatedTransfers[index], balance: balanceEth };
      setMultiKeyTransfers(updatedTransfers);
    } catch (err) {
      console.error('Failed to fetch balance for wallet ' + index + ':', err);
      
      const updatedTransfers = [...multiKeyTransfers];
      updatedTransfers[index] = { ...updatedTransfers[index], balance: 'Error' };
      setMultiKeyTransfers(updatedTransfers);
    }
  };

  // Handle changes to multi-key transfer entries
  const handleMultiKeyChange = (index, field, value) => {
    const updatedTransfers = [...multiKeyTransfers];
    updatedTransfers[index] = { ...updatedTransfers[index], [field]: value };
    setMultiKeyTransfers(updatedTransfers);
  };

  // Handle loading all keys in the multi-key tab
  const handleLoadAllKeys = async () => {
    if (!providerRef.current) {
      setError('Provider is not initialized yet');
      return;
    }

    setIsLoadingKeys(true);
    setError('');
    console.log('Loading all private keys with valid format');

    // Get all rows with private keys
    const keysToLoad = multiKeyTransfers.filter(t => t.privateKey && t.privateKey.trim() !== '');
    
    if (keysToLoad.length === 0) {
      setError('No private keys to load');
      setIsLoadingKeys(false);
      return;
    }

    const updatedTransfers = [...multiKeyTransfers];
    
    // Process each key one at a time
    for (let i = 0; i < keysToLoad.length; i++) {
      const index = multiKeyTransfers.indexOf(keysToLoad[i]);
      const transfer = keysToLoad[i];
      
      try {
        console.log(`Processing key ${i + 1}/${keysToLoad.length} at index ${index}`);
        
        // Derive address
        const wallet = new ethers.Wallet(transfer.privateKey);
        updatedTransfers[index] = { 
          ...updatedTransfers[index], 
          sourceAddress: wallet.address,
          balance: 'Loading...'
        };
        setMultiKeyTransfers([...updatedTransfers]);
        
        // Fetch balance
        try {
          const balanceWei = await providerRef.current.getBalance(wallet.address, 'latest');
          const balanceEth = ethers.utils.formatEther(balanceWei);
          console.log('Balance fetched for wallet', index, ':', balanceEth, 'ETH');
          
          updatedTransfers[index] = { 
            ...updatedTransfers[index],
            balance: balanceEth
          };
          setMultiKeyTransfers([...updatedTransfers]);
        } catch (balanceErr) {
          console.error('Balance fetch error for wallet', index, ':', balanceErr);
          updatedTransfers[index] = { 
            ...updatedTransfers[index],
            balance: 'Error'
          };
          setMultiKeyTransfers([...updatedTransfers]);
        }
        
        // Slight delay to avoid rate limits
        if (i < keysToLoad.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error('Error processing private key at index', index, ':', err);
        updatedTransfers[index] = { 
          ...updatedTransfers[index],
          sourceAddress: 'Invalid key',
          balance: ''
        };
        setMultiKeyTransfers([...updatedTransfers]);
      }
    }
    
    setIsLoadingKeys(false);
  };// Function to validate a token and get its information
  const validateToken = async () => {
    if (!tokenAddress || !isValidAddress(tokenAddress)) {
      setError('Please enter a valid token address');
      setIsValidToken(false);
      return;
    }

    try {
      setError('');
      setIsValidToken(false);
      
      // Create token contract interface
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        providerRef.current
      );
      
      // Get token info
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name().catch(() => 'Unknown Token'),
        tokenContract.symbol().catch(() => 'UNKNOWN'),
        tokenContract.decimals().catch(() => 18)
      ]);
      
      // Truncate name and symbol to 15 characters
      const truncatedName = name.length > 15 ? name.substring(0, 15) + '...' : name;
      const truncatedSymbol = symbol.length > 15 ? symbol.substring(0, 15) + '...' : symbol;
      
      setTokenInfo({ 
        name: truncatedName, 
        symbol: truncatedSymbol, 
        fullName: name,
        fullSymbol: symbol,
        decimals 
      });
      
      setIsValidToken(true);
      setStatus(`Token validated: ${truncatedName} (${truncatedSymbol})`);

      // Update token balances for any loaded wallets
      if (isValidToken && buyerWallets.some(w => w.address)) {
        await updateAllTokenBalances();
      }
    } catch (err) {
      console.error('Token validation error:', err);
      setError(`Failed to validate token: ${err.message}`);
      setIsValidToken(false);
    }
  };

  const handleBuyerWalletChange = (index, field, value) => {
    console.log('Wallet change:', { index, field, value });
    
    // Create a new array to avoid mutating state directly
    const updatedWallets = buyerWallets.map((wallet, walletIndex) => {
      // If this is the wallet we're updating, create a new object with updated field
      if (walletIndex === index) {
        return { 
          ...wallet, 
          [field]: value 
        };
      }
      // Otherwise return the wallet unchanged
      return wallet;
    });
  
    // Update the entire wallets state
    setBuyerWallets(updatedWallets);
  
    // If it's a private key, try to derive address
    if (field === 'privateKey' && value) {
      try {
        const trimmedKey = value.trim();
        const wallet = new ethers.Wallet(trimmedKey);
        
        // Update the same wallet with derived address
        const addressUpdatedWallets = updatedWallets.map((w, walletIndex) => 
          walletIndex === index 
            ? { ...w, address: wallet.address } 
            : w
        );
  
        // Update state again
        setBuyerWallets(addressUpdatedWallets);
      } catch (error) {
        console.error('Error processing private key:', error);
      }
    }
  };

  // Function to fetch balance for a buyer wallet
  const fetchBuyerWalletBalance = async (index, address, walletsArray = null) => {
    if (!providerRef.current || !address) return;
    
    const wallets = walletsArray || [...buyerWallets];
    
    try {
      wallets[index].balance = 'Loading...';
      if (!walletsArray) {
        setBuyerWallets([...wallets]);
      }
      
      const balanceWei = await providerRef.current.getBalance(address, 'latest');
      const balanceEth = ethers.utils.formatEther(balanceWei);
      
      wallets[index].balance = balanceEth;
      
      if (!walletsArray) {
        setBuyerWallets([...wallets]);
      }
    } catch (err) {
      console.error('Failed to fetch buyer wallet balance:', err);
      wallets[index].balance = 'Error';
      
      if (!walletsArray) {
        setBuyerWallets([...wallets]);
      }
    }
  };

  // Function to fetch token balance for a wallet
  const fetchTokenBalance = async (index, walletAddress, tokenContractAddress) => {
    if (!providerRef.current || !walletAddress || !tokenContractAddress) return;
    
    try {
      const updatedWallets = [...buyerWallets];
      updatedWallets[index].tokenBalance = 'Loading...';
      setBuyerWallets(updatedWallets);
      
      const tokenContract = new ethers.Contract(
        tokenContractAddress,
        ERC20_ABI,
        providerRef.current
      );
      
      // Get token decimals first
      let decimals = tokenInfo.decimals;
      try {
        decimals = await tokenContract.decimals();
        updatedWallets[index].tokenDecimals = decimals;
      } catch (err) {
        console.error("Error getting token decimals, using default:", err);
      }
      
      // Get token balance
      const tokenBalanceWei = await tokenContract.balanceOf(walletAddress);
      const tokenBalanceFormatted = ethers.utils.formatUnits(tokenBalanceWei, decimals);
      
      updatedWallets[index].tokenBalance = tokenBalanceFormatted;
      setBuyerWallets(updatedWallets);
      
      return tokenBalanceFormatted;
    } catch (err) {
      console.error('Failed to fetch token balance:', err);
      
      const updatedWallets = [...buyerWallets];
      updatedWallets[index].tokenBalance = 'Error';
      setBuyerWallets(updatedWallets);
      
      return '0';
    }
  };

  // Update token balances for all loaded wallets
  const updateAllTokenBalances = async () => {
    if (!isValidToken || !tokenAddress) return;
    
    const walletsWithAddresses = buyerWallets.filter(w => w.address && isValidAddress(w.address));
    
    for (let i = 0; i < walletsWithAddresses.length; i++) {
      const index = buyerWallets.indexOf(walletsWithAddresses[i]);
      await fetchTokenBalance(index, walletsWithAddresses[i].address, tokenAddress);
      
      // Small delay to avoid rate limits
      if (i < walletsWithAddresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  };// Function to refresh a specific buyer wallet's balance
  const refreshBuyerWalletBalance = (index) => {
    const wallet = buyerWallets[index];
    if (wallet.address) {
      fetchBuyerWalletBalance(index, wallet.address);
      
      // Also refresh token balance if token is validated
      if (isValidToken && tokenAddress) {
        fetchTokenBalance(index, wallet.address, tokenAddress);
      }
    }
  };

  const loadAllBuyerWallets = async () => {
    console.log('Load All Keys button clicked');
    
    // Log the entire buyerWallets state for debugging
    console.log('Full buyerWallets state:', JSON.stringify(buyerWallets, null, 2));
  
    // More robust filtering
    const keysToLoad = buyerWallets.filter(w => {
      const isValid = w.privateKey && w.privateKey.trim() !== '';
      console.log('Detailed wallet check:', {
        privateKey: w.privateKey,
        trimmedKey: w.privateKey ? w.privateKey.trim() : null,
        isValid: isValid
      });
      return isValid;
    });
    
    console.log('Keys to load:', keysToLoad);
  
    if (keysToLoad.length === 0) {
      console.error('No valid keys found in buyerWallets');
      setError('No valid private keys to load');
      return;
    }
  
    if (!providerRef.current) {
      console.error('Provider not initialized');
      setError('Network provider is not ready');
      return;
    }
  
    setIsLoadingKeys(true);
    setError('');
  
    const updatedWallets = [...buyerWallets];
    
    // Process each key one at a time
    for (let i = 0; i < keysToLoad.length; i++) {
      const wallet = keysToLoad[i];
      const index = buyerWallets.indexOf(wallet);
      
      try {
        console.log(`Processing key ${i + 1}/${keysToLoad.length} at index ${index}`);
        
        // Derive address
        const derivedWallet = new ethers.Wallet(wallet.privateKey);
        
        // Update wallet with derived address
        updatedWallets[index] = { 
          ...updatedWallets[index], 
          address: derivedWallet.address,
          balance: 'Loading...'
        };
        
        // Force update state
        setBuyerWallets([...updatedWallets]);
        
        // Fetch balance
        try {
          console.log(`Fetching balance for address: ${derivedWallet.address}`);
          
          const balanceWei = await providerRef.current.getBalance(derivedWallet.address, 'latest');
          const balanceEth = ethers.utils.formatEther(balanceWei);
          
          console.log(`Balance fetched for wallet ${index}:`, balanceEth, 'ETH');
          
          // Update balance
          updatedWallets[index] = { 
            ...updatedWallets[index],
            balance: balanceEth
          };
          
          // Force update state again
          setBuyerWallets([...updatedWallets]);
        } catch (balanceErr) {
          console.error(`Balance fetch error for wallet ${index}:`, balanceErr);
          
          // Update with error state
          updatedWallets[index] = { 
            ...updatedWallets[index],
            balance: 'Error'
          };
          
          // Force update state
          setBuyerWallets([...updatedWallets]);
        }
        
        // Slight delay to avoid rate limits
        if (i < keysToLoad.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`Error processing private key at index ${index}:`, err);
        
        // Update with invalid key state
        updatedWallets[index] = { 
          ...updatedWallets[index],
          address: 'Invalid key',
          balance: ''
        };
        
        // Force update state
        setBuyerWallets([...updatedWallets]);
      }
    }
    
    // Finish loading
    setIsLoadingKeys(false);
    
    console.log('Finished loading keys');
  };

  // Function to generate wallets
  const generateWallets = async () => {
    if (numWalletsToGenerate <= 0 || numWalletsToGenerate > 100) {
      setError('Please enter a number between 1 and 100');
      return;
    }
    
    setIsGenerating(true);
    setError('');
    
    // Generate wallets
    try {
      const wallets = [];
      
      for (let i = 0; i < numWalletsToGenerate; i++) {
        // Create a new random wallet
        const wallet = ethers.Wallet.createRandom();
        wallets.push({
          address: wallet.address,
          privateKey: wallet.privateKey
        });
      }
      
      setGeneratedWallets(wallets);
    } catch (err) {
      console.error('Error generating wallets:', err);
      setError('Failed to generate wallets: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Function to download wallets as a text file
  const downloadWallets = () => {
    if (generatedWallets.length === 0) {
      setError('No wallets to download');
      return;
    }
    
    // Create content
    let content = 'Wallet Address,Private Key\n';
    generatedWallets.forEach(wallet => {
      content += `${wallet.address},${wallet.privateKey}\n`;
    });
    
    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated_wallets.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Function to copy wallet data to clipboard
  const copyToClipboard = () => {
    if (generatedWallets.length === 0) {
      setError('No wallets to copy');
      return;
    }
    
    // Create content
    let content = 'Wallet Address,Private Key\n';
    generatedWallets.forEach(wallet => {
      content += `${wallet.address},${wallet.privateKey}\n`;
    });
    
    navigator.clipboard.writeText(content)
      .then(() => {
        setStatus('Wallet data copied to clipboard!');
        setTimeout(() => setStatus(''), 3000);
      })
      .catch(err => {
        setError('Failed to copy to clipboard: ' + err.message);
      });
  };// Approve token for selling
  const approveToken = async (index) => {
    const wallet = buyerWallets[index];
    
    if (!isValidToken || !tokenAddress || !wallet.privateKey || !wallet.address) {
      setError('Invalid wallet configuration or token');
      return false;
    }
    
    setCurrentBuyIndex(index);
    setIsApproving(true);
    
    const updatedWallets = [...buyerWallets];
    updatedWallets[index].status = 'Approving...';
    setBuyerWallets(updatedWallets);
    
    try {
      // Create wallet and connect to provider
      const buyerWallet = new ethers.Wallet(wallet.privateKey);
      const connectedWallet = buyerWallet.connect(providerRef.current);
      
      // Create token contract instance
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        connectedWallet
      );
      
      // Approve token spending (max amount)
      const tx = await tokenContract.approve(
        UNISWAP_V3_ROUTER_ADDRESS[network],
        ethers.constants.MaxUint256
      );
      
      updatedWallets[index].status = `Approval Pending: ${tx.hash.substring(0, 10)}...`;
      setBuyerWallets([...updatedWallets]);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      updatedWallets[index].status = 'Approved';
      setBuyerWallets([...updatedWallets]);
      
      return true;
    } catch (err) {
      console.error('Token approval failed:', err);
      
      // More detailed error reporting
      let errorMsg;
      if (err.reason) {
        errorMsg = `Approval Error: ${err.reason}`;
      } else if (err.message) {
        if (err.message.includes('user rejected')) {
          errorMsg = 'Approval rejected by user';
        } else {
          errorMsg = err.message.length > 50 ? err.message.substring(0, 50) + '...' : err.message;
        }
      } else {
        errorMsg = 'Unknown approval error';
      }
      
      updatedWallets[index].status = `Error: ${errorMsg}`;
      setBuyerWallets([...updatedWallets]);
      return false;
    } finally {
      setIsApproving(false);
    }
  };

  // Function to execute a buy transaction
  const executeBuy = async (index) => {
    const wallet = buyerWallets[index];
    
    if (!isValidToken || !tokenAddress || !wallet.privateKey || !wallet.address || !wallet.ethAmount) {
      setError('Invalid wallet configuration or token');
      return;
    }
    
    if (!UNISWAP_V3_ROUTER_ADDRESS[network]) {
      setError(`Uniswap V3 router not available for ${network} network`);
      return;
    }
    
    setCurrentBuyIndex(index);
    setIsBuying(true);
    
    const updatedWallets = [...buyerWallets];
    updatedWallets[index].status = 'Processing...';
    setBuyerWallets(updatedWallets);
    
    try {
      // Create wallet and connect to provider
      const buyerWallet = new ethers.Wallet(wallet.privateKey);
      const connectedWallet = buyerWallet.connect(providerRef.current);
      
      // Amount in Wei
      const amountIn = ethers.utils.parseEther(wallet.ethAmount);
      
      // Create router contract interface with the full ABI
      const router = new ethers.Contract(
        UNISWAP_V3_ROUTER_ADDRESS[network],
        SWAP_ROUTER_ABI,
        connectedWallet
      );
      
      // Prepare swap parameters
      const params = {
        tokenIn: WETH_ADDRESS[network],
        tokenOut: tokenAddress,
        fee: 10000, // 1% fee tier
        recipient: wallet.address,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      };
      
      console.log("Swap params:", params);
      
      // Execute swap
      const tx = await router.exactInputSingle(
        params,
        {
          value: amountIn,
          gasLimit: 500000 // Increased gas limit for swaps
        }
      );
      
      updatedWallets[index].status = `Pending: ${tx.hash.substring(0, 10)}...`;
      setBuyerWallets([...updatedWallets]);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Update status
      updatedWallets[index].status = `Success: ${tx.hash.substring(0, 10)}...`;
      setBuyerWallets([...updatedWallets]);
      
      // Refresh balances
      fetchBuyerWalletBalance(index, wallet.address);
      fetchTokenBalance(index, wallet.address, tokenAddress);
      
    } catch (err) {
      console.error('Buy transaction failed:', err);
      
      // More detailed error reporting
      let errorMsg;
      if (err.reason) {
        errorMsg = `Error: ${err.reason}`;
      } else if (err.message) {
        if (err.message.includes('insufficient funds')) {
          errorMsg = 'Insufficient ETH in wallet';
        } else if (err.message.includes('user rejected')) {
          errorMsg = 'Transaction rejected by user';
        } else if (err.message.includes('execution reverted')) {
          errorMsg = 'Transaction reverted - liquidity or token restrictions';
        } else {
          errorMsg = err.message.length > 50 ? err.message.substring(0, 50) + '...' : err.message;
        }
      } else {
        errorMsg = 'Unknown error';
      }
      
      updatedWallets[index].status = `Error: ${errorMsg}`;
      setBuyerWallets([...updatedWallets]);
    } finally {
      setIsBuying(false);
      setCurrentBuyIndex(null);
    }
  };// Function to execute a sell transaction with percentage - MODIFIED to convert WETH to ETH
  const executeSell = async (index, percentage) => {
    const wallet = buyerWallets[index];
    
    if (!isValidToken || !tokenAddress || !wallet.privateKey || !wallet.address) {
      setError('Invalid wallet configuration or token');
      return;
    }
    
    // Make sure we have a token balance
    if (wallet.tokenBalance === 'Loading...' || wallet.tokenBalance === 'Error' || parseFloat(wallet.tokenBalance) <= 0) {
      setError('Invalid or zero token balance');
      return;
    }
    
    if (!UNISWAP_V3_ROUTER_ADDRESS[network]) {
      setError(`Uniswap V3 router not available for ${network} network`);
      return;
    }
    
    setCurrentBuyIndex(index);
    setIsSelling(true);
    
    const updatedWallets = [...buyerWallets];
    updatedWallets[index].status = 'Approving...';
    setBuyerWallets(updatedWallets);
    
    try {
      // First approve the router to spend the tokens
      const approved = await approveToken(index);
      if (!approved) {
        setIsSelling(false);
        setCurrentBuyIndex(null);
        return;
      }
      
      updatedWallets[index].status = 'Processing sell...';
      setBuyerWallets(updatedWallets);
      
      // Create wallet and connect to provider
      const buyerWallet = new ethers.Wallet(wallet.privateKey);
      const connectedWallet = buyerWallet.connect(providerRef.current);
      
      // Calculate amount based on percentage
      const tokenBalance = parseFloat(wallet.tokenBalance);
      const sellAmount = tokenBalance * (percentage / 100);
      const sellAmountWei = ethers.utils.parseUnits(
        sellAmount.toFixed(wallet.tokenDecimals), 
        wallet.tokenDecimals
      );
      
      // Create router contract interface with the full ABI
      const router = new ethers.Contract(
        UNISWAP_V3_ROUTER_ADDRESS[network],
        SWAP_ROUTER_ABI,
        connectedWallet
      );
      
      // Prepare swap parameters for selling tokens to WETH
      const params = {
        tokenIn: tokenAddress,
        tokenOut: WETH_ADDRESS[network],
        fee: 10000, // 1% fee tier
        recipient: wallet.address, // Send WETH back to the wallet
        amountIn: sellAmountWei,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      };
      
      console.log("Sell params:", params);
      
      // Execute swap tokens to WETH
      updatedWallets[index].status = `Swapping tokens to WETH...`;
      setBuyerWallets([...updatedWallets]);
      
      const swapTx = await router.exactInputSingle(
        params,
        {
          gasLimit: 500000 // Increased gas limit for swaps
        }
      );
      
      updatedWallets[index].status = `Swap pending: ${swapTx.hash.substring(0, 10)}...`;
      setBuyerWallets([...updatedWallets]);
      
      // Wait for transaction confirmation
      await swapTx.wait();
      
      // Now unwrap WETH to ETH
      updatedWallets[index].status = `Converting WETH to ETH...`;
      setBuyerWallets([...updatedWallets]);
      
      // Create WETH contract interface
      const wethContract = new ethers.Contract(
        WETH_ADDRESS[network],
        WETH_ABI,
        connectedWallet
      );
      
      // Check WETH balance
      const wethBalance = await wethContract.balanceOf(wallet.address);
      
      if (wethBalance.gt(0)) {
        // Withdraw all WETH to ETH
        const withdrawTx = await wethContract.withdraw(wethBalance, {
          gasLimit: 100000
        });
        
        updatedWallets[index].status = `Unwrapping WETH: ${withdrawTx.hash.substring(0, 10)}...`;
        setBuyerWallets([...updatedWallets]);
        
        // Wait for unwrap confirmation
        await withdrawTx.wait();
        
        // Update final status
        updatedWallets[index].status = `Sold ${percentage}% to ETH`;
        setBuyerWallets([...updatedWallets]);
      } else {
        updatedWallets[index].status = `Swap completed, no WETH to convert`;
        setBuyerWallets([...updatedWallets]);
      }
      
      // Refresh balances
      fetchBuyerWalletBalance(index, wallet.address);
      fetchTokenBalance(index, wallet.address, tokenAddress);
      
    } catch (err) {
      console.error('Sell transaction failed:', err);
      
      // More detailed error reporting
      let errorMsg;
      if (err.reason) {
        errorMsg = `Error: ${err.reason}`;
      } else if (err.message) {
        if (err.message.includes('insufficient funds')) {
          errorMsg = 'Insufficient tokens to sell';
        } else if (err.message.includes('user rejected')) {
          errorMsg = 'Transaction rejected by user';
        } else if (err.message.includes('execution reverted')) {
          errorMsg = 'Sell reverted - liquidity or token restrictions';
        } else {
          errorMsg = err.message.length > 50 ? err.message.substring(0, 50) + '...' : err.message;
        }
      } else {
        errorMsg = 'Unknown error';
      }
      
      updatedWallets[index].status = `Error: ${errorMsg}`;
      setBuyerWallets([...updatedWallets]);
    } finally {
      setIsSelling(false);
      setCurrentBuyIndex(null);
    }
  };

  // Handle recipient input changes for the single key tab
  const handleRecipientChange = (index, field, value) => {
    const newRecipients = [...recipients];
    newRecipients[index] = { ...newRecipients[index], [field]: value };
    setRecipients(newRecipients);
  };

  // Derive address from single private key
  const handleDeriveAddress = useCallback(() => {
    if (!privateKey) {
      setError('Please enter a private key');
      return;
    }

    try {
      setError('');
      console.log('Deriving address from private key');
      
      // Create wallet from private key
      const wallet = new ethers.Wallet(privateKey);
      setWalletAddress(wallet.address);
      console.log('Address derived:', wallet.address);

      // Get balance if provider is available
      if (providerRef.current) {
        fetchBalance(wallet.address);
      }
    } catch (err) {
      console.error('Error deriving address:', err);
      setError('Invalid private key format: ' + err.message);
      setWalletAddress('');
      setBalance('');
    }
  }, [privateKey, fetchBalance]);

  // Check if single key form is valid
  const isSingleKeyFormValid = useCallback(() => {
    const hasValidRecipient = recipients.some(r => 
      r.address && r.amount && isValidAddress(r.address) && parseFloat(r.amount) > 0
    );
    
    return privateKey && walletAddress && hasValidRecipient && providerRef.current;
  }, [privateKey, walletAddress, recipients]);

  // Check if multi-key form is valid
  const isMultiKeyFormValid = useCallback(() => {
    const hasValidTransfer = multiKeyTransfers.some(t => 
      t.privateKey && 
      t.sourceAddress && 
      t.destinationAddress && 
      t.amount && 
      isValidAddress(t.destinationAddress) && 
      parseFloat(t.amount) > 0
    );
    
    return hasValidTransfer && providerRef.current;
  }, [multiKeyTransfers]);// Handle single key transaction submission
  const handleSingleKeySubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setTransactionHashes([]);

    if (!providerRef.current) {
      setError('Provider is not initialized yet');
      return;
    }

    if (!privateKey) {
      setError('Please enter your private key');
      return;
    }

    const validRecipients = recipients.filter(r => 
      r.address && r.amount && isValidAddress(r.address) && parseFloat(r.amount) > 0
    );

    if (validRecipients.length === 0) {
      setError('Please enter at least one valid recipient with address and amount');
      return;
    }

    try {
      setIsLoading(true);
      console.log('Starting single key batch transactions for', validRecipients.length, 'recipients');
      
      const wallet = new ethers.Wallet(privateKey);
      const connectedWallet = wallet.connect(providerRef.current);
      
      const hashes = [];
      setStatus(`Starting batch transactions: 0/${validRecipients.length} complete`);
      
      for (let i = 0; i < validRecipients.length; i++) {
        const recipient = validRecipients[i];
        
        try {
          console.log(`Processing transaction ${i + 1}/${validRecipients.length}`);
          const tx = {
            to: recipient.address,
            value: ethers.utils.parseEther(recipient.amount.toString())
          };

          try {
            console.log('Estimating gas...');
            const gasEstimate = await providerRef.current.estimateGas({
              from: wallet.address,
              to: recipient.address,
              value: ethers.utils.parseEther(recipient.amount.toString())
            });
            tx.gasLimit = gasEstimate;
            
            console.log('Getting fee data...');
            const feeData = await providerRef.current.getFeeData();
            
            if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
              tx.maxFeePerGas = feeData.maxFeePerGas;
              tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
              console.log('Using EIP-1559 fees');
            } else {
              tx.gasPrice = await providerRef.current.getGasPrice();
              console.log('Using legacy gas price');
            }
          } catch (err) {
            console.warn('Error estimating gas, using defaults:', err);
            tx.gasLimit = 21000;
            tx.gasPrice = await providerRef.current.getGasPrice();
          }
          
          setStatus(`Sending transaction ${i + 1}/${validRecipients.length} to ${recipient.address.substring(0, 6)}...${recipient.address.substring(38)}`);
          
          console.log('Sending transaction...');
          const transaction = await connectedWallet.sendTransaction(tx);
          console.log('Transaction sent, hash:', transaction.hash);
          
          hashes.push({
            to: recipient.address,
            amount: recipient.amount,
            hash: transaction.hash
          });
          
          setTransactionHashes([...hashes]);
          setStatus(`Transaction ${i + 1}/${validRecipients.length} sent! Waiting for next transaction...`);
          
          // Wait briefly between transactions
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (err) {
          console.error('Transaction failed:', err);
          hashes.push({
            to: recipient.address,
            amount: recipient.amount,
            error: err.message
          });
          setTransactionHashes([...hashes]);
        }
      }
      
      setStatus(`Batch complete: ${hashes.filter(h => h.hash).length}/${validRecipients.length} transactions sent successfully`);
      
      // Refresh balance after transactions
      fetchBalance(wallet.address);
    } catch (err) {
      console.error('Transaction processing failed:', err);
      setError(`Transaction processing failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle multi-key transaction submission
  const handleMultiKeySubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setTransactionHashes([]);

    if (!providerRef.current) {
      setError('Provider is not initialized yet');
      return;
    }

    const validTransfers = multiKeyTransfers.filter(t => 
      t.privateKey && 
      t.sourceAddress && 
      t.destinationAddress && 
      t.amount && 
      isValidAddress(t.destinationAddress) && 
      parseFloat(t.amount) > 0
    );

    if (validTransfers.length === 0) {
      setError('Please enter at least one valid transfer with private key, destination address, and amount');
      return;
    }

    try {
      setIsLoading(true);
      console.log('Starting multi-key transactions for', validTransfers.length, 'wallets');
      
      const hashes = [];
      const newMultiKeyTransfers = [...multiKeyTransfers];
      
      setStatus(`Starting multi-wallet transactions: 0/${validTransfers.length} complete`);
      
      for (let i = 0; i < validTransfers.length; i++) {
        const transfer = validTransfers[i];
        
        try {
          console.log(`Processing transaction ${i + 1}/${validTransfers.length} from wallet`);
          newMultiKeyTransfers[multiKeyTransfers.indexOf(transfer)].status = 'Processing...';
          setMultiKeyTransfers([...newMultiKeyTransfers]);
          
          const wallet = new ethers.Wallet(transfer.privateKey);
          const connectedWallet = wallet.connect(providerRef.current);
          
          const tx = {
            to: transfer.destinationAddress,
            value: ethers.utils.parseEther(transfer.amount.toString())
          };

          try {
            console.log('Estimating gas...');
            const gasEstimate = await providerRef.current.estimateGas({
              from: wallet.address,
              to: transfer.destinationAddress,
              value: ethers.utils.parseEther(transfer.amount.toString())
            });
            tx.gasLimit = gasEstimate;
            
            console.log('Getting fee data...');
            const feeData = await providerRef.current.getFeeData();
            
            if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
              tx.maxFeePerGas = feeData.maxFeePerGas;
              tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
              console.log('Using EIP-1559 fees');
            } else {
              tx.gasPrice = await providerRef.current.getGasPrice();
              console.log('Using legacy gas price');
            }
          } catch (err) {
            console.warn('Error estimating gas, using defaults:', err);
            tx.gasLimit = 21000;
            tx.gasPrice = await providerRef.current.getGasPrice();
          }
          
          setStatus(`Sending transaction ${i + 1}/${validTransfers.length} from ${wallet.address.substring(0, 6)}...`);
          
          console.log('Sending transaction...');
          const transaction = await connectedWallet.sendTransaction(tx);
          console.log('Transaction sent, hash:', transaction.hash);
          
          hashes.push({
            from: wallet.address,
            to: transfer.destinationAddress,
            amount: transfer.amount,
            hash: transaction.hash
          });
          
          newMultiKeyTransfers[multiKeyTransfers.indexOf(transfer)].status = 'Success: ' + transaction.hash.substring(0, 10) + '...';
          setMultiKeyTransfers([...newMultiKeyTransfers]);
          
          setTransactionHashes([...hashes]);
          setStatus(`Transaction ${i + 1}/${validTransfers.length} sent! Waiting for next transaction...`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Update balance after transaction
          fetchMultiKeyBalance(multiKeyTransfers.indexOf(transfer));
          
        } catch (err) {
          console.error('Transaction failed:', err);
          const errorMsg = err.message.length > 50 ? err.message.substring(0, 50) + '...' : err.message;
          newMultiKeyTransfers[multiKeyTransfers.indexOf(transfer)].status = 'Error: ' + errorMsg;
          setMultiKeyTransfers([...newMultiKeyTransfers]);
          
          hashes.push({
            from: transfer.sourceAddress,
            to: transfer.destinationAddress,
            amount: transfer.amount,
            error: err.message
          });
          setTransactionHashes([...hashes]);
        }
      }
      
      setStatus(`Multi-wallet batch complete: ${hashes.filter(h => h.hash).length}/${validTransfers.length} transactions sent successfully`);
    } catch (err) {
      console.error('Transaction processing failed:', err);
      setError(`Transaction processing failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };// Handle single key transaction submission




  // Function to manually retry balance fetch for multi-key tab
  const retryFetchMultiKeyBalance = (index) => {
    console.log('Manually retrying balance fetch for multi-key wallet at index:', index);
    fetchMultiKeyBalance(index);
  };

  // Clear sensitive data when component is unmounted
  useEffect(() => {
    return () => {
      setPrivateKey('');
      setMultiKeyTransfers(Array(30).fill().map(() => ({ 
        privateKey: '', 
        sourceAddress: '',
        destinationAddress: '', 
        amount: '',
        balance: '',
        status: '' 
      })));
      setBuyerWallets(Array(30).fill().map(() => ({
        privateKey: '',
        address: '',
        balance: '',
        ethAmount: '',
        tokenBalance: '0',
        tokenDecimals: 18,
        status: ''
      })));
    };
  }, []);

  return (
    <div className="container">
      <div className="app-header">
        <img src={rugLogo} alt="Butter Rugomatic 2000 Logo" className="app-logo" />
        <h1>Butter Rugomatic 2000</h1>
      </div>
      
      <div className="security-warning">
        <strong>Security Warning:</strong>
        <p>Never share your private keys. This app processes keys locally in your browser, but for maximum security, consider using hardware wallets instead.</p>
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        <button 
          className={`tab-button ${activeTab === 0 ? 'active' : ''}`} 
          onClick={() => setActiveTab(0)}
        >
          Single Key to Multiple Recipients
        </button>
        <button 
          className={`tab-button ${activeTab === 1 ? 'active' : ''}`} 
          onClick={() => setActiveTab(1)}
        >
          Multiple Keys to Recipients
        </button>
        <button 
          className={`tab-button ${activeTab === 2 ? 'active' : ''}`} 
          onClick={() => setActiveTab(2)}
        >
          Wallet Generator
        </button>
        <button 
          className={`tab-button ${activeTab === 3 ? 'active' : ''}`} 
          onClick={() => setActiveTab(3)}
        >
          Buy Token
        </button>
      </div>

      {/* Network Selection - Common to transaction tabs */}
      {activeTab !== 2 && (
        <div className="form-group">
          <label htmlFor="network">Network</label>
          <select 
            id="network"
            value={network} 
            onChange={(e) => setNetwork(e.target.value)}
          >
            <option value="base">Base Mainnet</option>
            <option value="base_sepolia">Base Sepolia Testnet</option>
            <option value="mainnet">Ethereum Mainnet</option>
            <option value="sepolia">Ethereum Sepolia Testnet</option>
            <option value="goerli">Ethereum Goerli Testnet</option>
          </select>
          {activeTab === 3 && (
            <div className="network-note">
              Note: Ensure your selected network supports Uniswap V3
            </div>
          )}
        </div>
      )}{/* Tab 1: Single Private Key to Multiple Recipients */}
      {activeTab === 0 && (
        <>
          <div className="form-group">
            <label htmlFor="privateKey">Private Key</label>
            <div className="key-input-group">
              <input
                id="privateKey"
                type="password"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Enter your private key"
                autoComplete="off"
              />
              <button
                onClick={handleDeriveAddress}
                disabled={!privateKey || isLoading}
              >
                Load
              </button>
            </div>
          </div>

          {walletAddress && (
  <div className="wallet-info">
    <p>
      <strong>Wallet Address:</strong> {walletAddress}
    </p>
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <p>
        <strong>Balance:</strong> {balance ? `${parseFloat(balance).toFixed(4)} ETH` : 'Loading...'}
      </p>
      <button 
        onClick={fetchBalance}
        className="retry-button"
      >
        Retry
      </button>
    </div>
  </div>
)}

          <form onSubmit={handleSingleKeySubmit}>
            <h2 className="recipients-title">Recipients (up to 30)</h2>
            
            <div className="recipients-subtitle">
              Recipient Wallets and Amounts
            </div>
            
            {recipients.map((recipient, index) => (
              <div key={index} className="recipient-row">
                <div className="recipient-number">{index + 1}.</div>
                <input
                  type="text"
                  value={recipient.address}
                  onChange={(e) => handleRecipientChange(index, 'address', e.target.value)}
                  placeholder="Wallet Address (0x...)"
                  className="address-input"
                  disabled={isLoading}
                />
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={recipient.amount}
                  onChange={(e) => handleRecipientChange(index, 'amount', e.target.value)}
                  placeholder="ETH Amount"
                  className="amount-input"
                  disabled={isLoading}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={!isSingleKeyFormValid() || isLoading}
              className="send-button"
            >
              {isLoading ? 'Processing Transactions...' : 'Send Batch Transactions'}
            </button>
          </form>
        </>
      )}
      
      {/* Tab 2: Multiple Private Keys to Recipients */}
      {activeTab === 1 && (
        <>
          <form onSubmit={handleMultiKeySubmit}>
            <h2 className="recipients-title">Multiple Wallet Transfers (up to 30)</h2>
            
            <div className="recipients-subtitle">
              Each row represents a separate transaction from a different wallet
            </div>
            
            <div className="multi-key-controls">
              <button
                type="button"
                onClick={handleLoadAllKeys}
                disabled={isLoadingKeys || isLoading}
                className="load-all-button"
              >
                {isLoadingKeys ? 'Loading Keys...' : 'Load All Keys'}
              </button>
            </div>
            
            <div className="multi-key-header">
              <div className="multi-key-number">#</div>
              <div className="multi-key-pk">Private Key</div>
              <div className="multi-key-source">Source Address</div>
              <div className="multi-key-balance">Balance</div>
              <div className="multi-key-dest">Destination Address</div>
              <div className="multi-key-amount">Amount</div>
              <div className="multi-key-status">Status</div>
            </div>
            
            {multiKeyTransfers.map((transfer, index) => (
              <div key={index} className="multi-key-row">
                <div className="multi-key-number">{index + 1}.</div>
                <input
                  type="password"
                  value={transfer.privateKey}
                  onChange={(e) => handleMultiKeyChange(index, 'privateKey', e.target.value)}
                  placeholder="Private Key"
                  className="multi-key-pk-input"
                  disabled={isLoading || isLoadingKeys}
                  autoComplete="off"
                />
                <div className="multi-key-source-display">
                  {transfer.sourceAddress ? (
                    <span className="address-display">{transfer.sourceAddress.substring(0, 6)}...{transfer.sourceAddress.substring(38)}</span>
                  ) : (
                    <span className="address-placeholder">Source Address (derived)</span>
                  )}
                </div>
                <div className="multi-key-balance-display">
  {transfer.balance ? (
    <span>{parseFloat(transfer.balance).toFixed(4)} ETH <button onClick={() => retryFetchMultiKeyBalance(index)} className="tiny-button">↻</button></span>
  ) : (
    transfer.sourceAddress ? 'Loading...' : '-'
  )}
</div>
                <input
                  type="text"
                  value={transfer.destinationAddress}
                  onChange={(e) => handleMultiKeyChange(index, 'destinationAddress', e.target.value)}
                  placeholder="Destination Address (0x...)"
                  className="multi-key-dest-input"
                  disabled={isLoading || isLoadingKeys}
                />
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={transfer.amount}
                  onChange={(e) => handleMultiKeyChange(index, 'amount', e.target.value)}
                  placeholder="ETH"
                  className="multi-key-amount-input"
                  disabled={isLoading || isLoadingKeys}
                />
                <div className="multi-key-status-display">
                  {transfer.status || '-'}
                </div>
              </div>
            ))}

            <button
              type="submit"
              disabled={!isMultiKeyFormValid() || isLoading || isLoadingKeys}
              className="send-button"
            >
              {isLoading ? 'Processing Multi-Wallet Transfers...' : 'Send From Multiple Wallets'}
            </button>
          </form>
        </>
      )}{/* Tab 3: Wallet Generator */}
      {activeTab === 2 && (
        <div className="wallet-generator-tab">
          <h2 className="recipients-title">Generate New Wallets</h2>
          
          <div className="generator-controls">
            <div className="form-group generator-input">
              <label htmlFor="numWallets">Number of Wallets to Generate:</label>
              <input
                id="numWallets"
                type="number"
                min="1"
                max="100"
                value={numWalletsToGenerate}
                onChange={(e) => setNumWalletsToGenerate(parseInt(e.target.value) || 1)}
                className="number-input"
              />
            </div>
            
            <button
              onClick={generateWallets}
              disabled={isGenerating}
              className="generate-button"
            >
              {isGenerating ? 'Generating...' : 'Generate Wallets'}
            </button>
          </div>
          
          {generatedWallets.length > 0 && (
            <div className="wallet-results">
              <div className="wallet-results-header">
                <h3>Generated Wallets ({generatedWallets.length})</h3>
                <div className="wallet-actions">
                  <button onClick={copyToClipboard} className="action-button">
                    Copy to Clipboard
                  </button>
                  <button onClick={downloadWallets} className="action-button">
                    Download as Text File
                  </button>
                </div>
              </div>
              
              <div className="wallet-list">
                <div className="wallet-list-header">
                  <div className="wallet-item-number">#</div>
                  <div className="wallet-item-address">Wallet Address</div>
                  <div className="wallet-item-key">Private Key</div>
                </div>
                
                <div className="wallet-items-container">
                  {generatedWallets.map((wallet, index) => (
                    <div key={index} className="wallet-item">
                      <div className="wallet-item-number">{index + 1}</div>
                      <div className="wallet-item-address">{wallet.address}</div>
                      <div className="wallet-item-key">{wallet.privateKey}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Buy Token - Fixed Formatted Version with Sell Buttons */}
      {activeTab === 3 && (
        <div className="buy-token-tab">
          <h2 className="recipients-title">Buy/Sell Tokens with Multiple Wallets</h2>
          
          {/* Token and Slippage Settings */}
          <div className="token-config-panel">
            <div className="token-input-group">
              <div className="form-group">
                <label htmlFor="tokenAddress">Token Address</label>
                <div className="input-with-button">
                  <input
                    id="tokenAddress"
                    type="text"
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    placeholder="0x Token Contract Address"
                    className="token-address-input"
                  />
                  <button
                    onClick={validateToken}
                    disabled={!tokenAddress || !isValidAddress(tokenAddress)}
                    className="validate-token-button"
                  >
                    Validate Token
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="slippage">Slippage Tolerance (%)</label>
                <input
                  id="slippage"
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={slippage}
                  onChange={(e) => setSlippage(parseFloat(e.target.value) || 0.5)}
                  className="slippage-input"
                />
              </div>
            </div>
            
            {isValidToken && (
              <div className="token-info-panel">
                <div className="token-info-item">
                  <span className="token-info-label">Name:</span>
                  <span className="token-info-value" title={tokenInfo.fullName || tokenInfo.name}>{tokenInfo.name}</span>
                </div>
                <div className="token-info-item">
                  <span className="token-info-label">Symbol:</span>
                  <span className="token-info-value" title={tokenInfo.fullSymbol || tokenInfo.symbol}>{tokenInfo.symbol}</span>
                </div>
                <div className="token-info-item">
                  <span className="token-info-label">Decimals:</span>
                  <span className="token-info-value">{tokenInfo.decimals}</span>
                </div>
              </div>
            )}
          </div>
          
          {/* Buyer Wallets Section */}
          <div className="buyer-wallets-section">
            <div className="section-header">
              <h3>Wallets (up to 30)</h3>
              <button
                onClick={loadAllBuyerWallets}
                className="load-all-button"
                disabled={isBuying || isSelling}
              >
                Load All Keys
              </button>
            </div>
            
            <div className="buyer-wallets-header">
              <div className="buyer-wallet-number">#</div>
              <div className="buyer-wallet-key">Private Key</div>
              <div className="buyer-wallet-address">Wallet Address</div>
              <div className="buyer-wallet-balance">ETH Balance</div>
              <div className="buyer-wallet-token-balance">Token Balance</div>
              <div className="buyer-wallet-amount">ETH to Swap</div>
              <div className="buyer-wallet-action">Action</div>
              <div className="buyer-wallet-status">Status</div>
            </div>
            
            <div className="buyer-wallets-list">
              {buyerWallets.map((wallet, index) => (
                <div key={index} className="buyer-wallet-row">
                  <div className="buyer-wallet-number">{index + 1}.</div>
                  <div className="buyer-wallet-key">
                    <input
                      type="password"
                      value={wallet.privateKey}
                      onChange={(e) => handleBuyerWalletChange(index, 'privateKey', e.target.value)}
                      placeholder="Private Key"
                      className="buyer-wallet-key-input"
                      disabled={(isBuying || isSelling) && currentBuyIndex === index}
                      autoComplete="off"
                    />
                  </div>
                  <div className="buyer-wallet-address">
                    <div className="buyer-wallet-address-display">
                      {wallet.address ? (
                        <span className="address-display">{wallet.address.substring(0, 6)}...{wallet.address.substring(38)}</span>
                      ) : (
                        <span className="address-placeholder">Source Address (derived)</span>
                      )}
                    </div>
                  </div>
                  <div className="buyer-wallet-balance">
                  <div className="buyer-wallet-balance-display">
  {wallet.balance ? (
    <span>{parseFloat(wallet.balance).toFixed(4)} ETH <button onClick={() => refreshBuyerWalletBalance(index)} className="tiny-button">↻</button></span>
  ) : (
    wallet.address ? 'Loading...' : '-'
  )}
</div>
                  </div>
                  <div className="buyer-wallet-token-balance">
                    <div className="buyer-wallet-balance-display">
                      {isValidToken ? (
                        wallet.tokenBalance === 'Loading...' ? 'Loading...' :
                        wallet.tokenBalance === 'Error' ? 'Error' :
                        parseFloat(wallet.tokenBalance) > 0 ? 
                          <span>{parseFloat(wallet.tokenBalance).toFixed(6)} {tokenInfo.symbol}</span> : 
                          <span>0 {tokenInfo.symbol}</span>
                      ) : (
                        '-'
                      )}
                    </div>
                  </div>
                  <div className="buyer-wallet-amount">
                    <input
                      type="number"
                      min="0"
                      step="0.000001"
                      value={wallet.ethAmount}
                      onChange={(e) => handleBuyerWalletChange(index, 'ethAmount', e.target.value)}
                      placeholder="ETH Amount"
                      className="buyer-wallet-amount-input"
                      disabled={(isBuying || isSelling) && currentBuyIndex === index}
                    />
                  </div>
                  <div className="buyer-wallet-action">
                    <div className="buyer-wallet-action-cell">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <button
                          onClick={() => executeBuy(index)}
                          disabled={!isValidToken || !wallet.privateKey || !wallet.address || !wallet.ethAmount || (isBuying && currentBuyIndex === index) || isSelling}
                          className="buy-button"
                          style={{ marginBottom: '5px' }}
                        >
                          {(isBuying && currentBuyIndex === index) ? 'Buying...' : 'Buy'}
                        </button>
                        
                        {/* Sell buttons */}
                        {isValidToken && wallet.tokenBalance && parseFloat(wallet.tokenBalance) > 0 && (
                          <div className="sell-buttons-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            <button
                              onClick={() => executeSell(index, 25)}
                              disabled={(isBuying || isSelling || isApproving) && currentBuyIndex === index}
                              className="sell-button"
                              style={{ 
                                flex: '1 0 40%', 
                                padding: '3px', 
                                fontSize: '12px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Sell 25%
                            </button>
                            <button
                              onClick={() => executeSell(index, 50)}
                              disabled={(isBuying || isSelling || isApproving) && currentBuyIndex === index}
                              className="sell-button"
                              style={{ 
                                flex: '1 0 40%', 
                                padding: '3px', 
                                fontSize: '12px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Sell 50%
                            </button>
                            <button
                              onClick={() => executeSell(index, 75)}
                              disabled={(isBuying || isSelling || isApproving) && currentBuyIndex === index}
                              className="sell-button"
                              style={{ 
                                flex: '1 0 40%', 
                                padding: '3px', 
                                fontSize: '12px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Sell 75%
                            </button>
                            <button
                              onClick={() => executeSell(index, 100)}
                              disabled={(isBuying || isSelling || isApproving) && currentBuyIndex === index}
                              className="sell-button"
                              style={{ 
                                flex: '1 0 40%', 
                                padding: '3px', 
                                fontSize: '12px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Sell 100%
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="buyer-wallet-status">
                    <div className="buyer-wallet-status-display">
                      {wallet.status || '-'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}{/* Common Status and Error Messages */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {status && (
        <div className="status-message">
          {status}
        </div>
      )}

      {/* Transaction Results (only show in first tab) */}
      {activeTab === 0 && transactionHashes.length > 0 && (
        <div className="transactions-list">
          <h3>Transaction Results:</h3>
          <div>
            {transactionHashes.map((tx, index) => (
              <div key={index} className={`transaction-item ${tx.hash ? 'transaction-success' : 'transaction-error'}`}>
                <p>
                  <span className="font-bold">To:</span> {tx.to}
                </p>
                <p>
                  <span className="font-bold">Amount:</span> {tx.amount} ETH
                </p>
                {tx.hash ? (
                  <p className="break-all">
                    <span className="font-bold">Hash:</span> {tx.hash}
                  </p>
                ) : (
                  <p className="text-red-600">
                    <span className="font-bold">Error:</span> {tx.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EthereumTransferApp;