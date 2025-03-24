import { ethers } from 'ethers';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import rugLogo from './rug.png'; // Make sure the case matches your actual file

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
    status: ''
  })));
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({ name: '', symbol: '', decimals: 18 });
  const [isBuying, setIsBuying] = useState(false);
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
  };

  // Initialize provider when network changes
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
  };

  // Function to validate a token and get its information
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
        [
          'function name() view returns (string)',
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)'
        ],
        providerRef.current
      );
      
      // Get token info
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name().catch(() => 'Unknown Token'),
        tokenContract.symbol().catch(() => 'UNKNOWN'),
        tokenContract.decimals().catch(() => 18)
      ]);
      
      setTokenInfo({ name, symbol, decimals });
      setIsValidToken(true);
      setStatus(`Token validated: ${name} (${symbol})`);
    } catch (err) {
      console.error('Token validation error:', err);
      setError(`Failed to validate token: ${err.message}`);
      setIsValidToken(false);
    }
  };

  // Function to handle buyer wallet information changes
  const handleBuyerWalletChange = (index, field, value) => {
    const updatedWallets = [...buyerWallets];
    updatedWallets[index] = { ...updatedWallets[index], [field]: value };
    
    // If private key is changed, try to derive address
    if (field === 'privateKey' && value) {
      try {
        const wallet = new ethers.Wallet(value);
        updatedWallets[index].address = wallet.address;
        
        // Fetch balance if provider is available
        if (providerRef.current) {
          fetchBuyerWalletBalance(index, wallet.address, updatedWallets);
        }
      } catch {
        updatedWallets[index].address = '';
        updatedWallets[index].balance = '';
      }
    }
    
    setBuyerWallets(updatedWallets);
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

  // Function to refresh a specific buyer wallet's balance
  const refreshBuyerWalletBalance = (index) => {
    const wallet = buyerWallets[index];
    if (wallet.address) {
      fetchBuyerWalletBalance(index, wallet.address);
    }
  };

  // Function to load all buyer wallet private keys at once
  const loadAllBuyerWallets = async () => {
    const keysToLoad = buyerWallets.filter(w => w.privateKey && !w.address);
    
    if (keysToLoad.length === 0) {
      return;
    }
    
    const updatedWallets = [...buyerWallets];
    
    for (let i = 0; i < keysToLoad.length; i++) {
      const index = buyerWallets.indexOf(keysToLoad[i]);
      
      try {
        const wallet = new ethers.Wallet(keysToLoad[i].privateKey);
        updatedWallets[index].address = wallet.address;
        setBuyerWallets([...updatedWallets]);
        
        // Fetch balance
        await fetchBuyerWalletBalance(index, wallet.address, updatedWallets);
        
        // Small delay to avoid rate limits
        if (i < keysToLoad.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err) {
        updatedWallets[index].address = 'Invalid key';
        updatedWallets[index].balance = '';
        setBuyerWallets([...updatedWallets]);
      }
    }
  };

  // Function to execute a buy transaction - UPDATED VERSION
  const executeBuy = async (index) => {
    const wallet = buyerWallets[index];
    
    if (!isValidToken || !wallet.privateKey || !wallet.address || !wallet.ethAmount) {
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
      
      // Current timestamp + 20 minutes
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      
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
      
      // Refresh balance
      fetchBuyerWalletBalance(index, wallet.address);
      
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
  }, [multiKeyTransfers]);

  // Handle single key transaction submission
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
          
          const tx ={
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
  };

  // Function to manually retry balance fetch
  const retryFetchBalance = () => {
    if (walletAddress) {
      console.log('Manually retrying balance fetch for address:', walletAddress);
      fetchBalance(walletAddress);
    }
  };

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
      )}
      
      {/* Tab 1: Single Private Key to Multiple Recipients */}
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
                  <strong>Balance:</strong> {balance ? `${balance} ETH` : 'Loading...'}
                </p>
                <button 
                  onClick={retryFetchBalance}
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
                    <span>{transfer.balance} ETH <button onClick={() => retryFetchMultiKeyBalance(index)} className="tiny-button">↻</button></span>
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
      )}

      {/* Tab 3: Wallet Generator */}
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

      {/* Tab 4: Buy Token - Fixed Formatted Version */}
      {activeTab === 3 && (
        <div className="buy-token-tab">
          <h2 className="recipients-title">Buy Tokens with Multiple Wallets</h2>
          
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
                  <span className="token-info-value">{tokenInfo.name}</span>
                </div>
                <div className="token-info-item">
                  <span className="token-info-label">Symbol:</span>
                  <span className="token-info-value">{tokenInfo.symbol}</span>
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
              <h3>Buyer Wallets (up to 30)</h3>
              <button
                onClick={loadAllBuyerWallets}
                className="load-all-button"
                disabled={isBuying}
              >
                Load All Keys
              </button>
            </div>
            
            <div className="buyer-wallets-header">
              <div className="buyer-wallet-number">#</div>
              <div className="buyer-wallet-key">Private Key</div>
              <div className="buyer-wallet-address">Wallet Address</div>
              <div className="buyer-wallet-balance">Balance</div>
              <div className="buyer-wallet-amount">ETH to Swap</div>
              <div className="buyer-wallet-status">Status</div>
              <div className="buyer-wallet-action">Action</div>
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
                      disabled={isBuying && currentBuyIndex === index}
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
                        <span>{wallet.balance} ETH <button onClick={() => refreshBuyerWalletBalance(index)} className="tiny-button">↻</button></span>
                      ) : (
                        wallet.address ? 'Loading...' : '-'
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
                      disabled={isBuying && currentBuyIndex === index}
                    />
                  </div>
                  <div className="buyer-wallet-status">
                    <div className="buyer-wallet-status-display">
                      {wallet.status || '-'}
                    </div>
                  </div>
                  <div className="buyer-wallet-action">
                    <div className="buyer-wallet-action-cell">
                      <button
                        onClick={() => executeBuy(index)}
                        disabled={!isValidToken || !wallet.privateKey || !wallet.address || !wallet.ethAmount || (isBuying && currentBuyIndex === index)}
                        className="buy-button"
                      >
                        {(isBuying && currentBuyIndex === index) ? 'Buying...' : 'Buy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Common Status and Error Messages */}
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