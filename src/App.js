import { ethers } from 'ethers';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import rugLogo from './rug.png'; // Make sure the case matches your actual file

const EthereumTransferApp = () => {
  // State for the active tab (0 = single key, 1 = multiple keys)
  const [activeTab, setActiveTab] = useState(0);
  
  // Single key tab states
  const [privateKey, setPrivateKey] = useState('');
  const [recipients, setRecipients] = useState(Array(10).fill().map(() => ({ address: '', amount: '' })));
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('');
  
  // Multiple keys tab states
  const [multiKeyTransfers, setMultiKeyTransfers] = useState(Array(10).fill().map(() => ({ 
    privateKey: '', 
    sourceAddress: '',
    destinationAddress: '', 
    amount: '',
    balance: '',
    status: '' 
  })));
  
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
      setMultiKeyTransfers(Array(10).fill().map(() => ({ 
        privateKey: '', 
        sourceAddress: '',
        destinationAddress: '', 
        amount: '',
        balance: '',
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
      </div>

      {/* Network Selection - Common to both tabs */}
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
      </div>
      
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
            <h2 className="recipients-title">Recipients (up to 10)</h2>
            
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
            <h2 className="recipients-title">Multiple Wallet Transfers (up to 10)</h2>
            
            <div className="recipients-subtitle">
              Each row represents a separate transaction from a different wallet
            </div>
            
            <div className="load-all-container">
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