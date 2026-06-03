import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import api from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ShieldCheck, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

export default function SendCrypto() {
  const { user, wallet, fetchUser } = useAuth();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Transaction State
  const [txData, setTxData] = useState({
    recipientAddress: '',
    amount: '',
    note: ''
  });
  
  const [txPassword, setTxPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  const [requestId, setRequestId] = useState(null);
  const [codeId, setCodeId] = useState(null);
  const [txResult, setTxResult] = useState(null);
  const [riskData, setRiskData] = useState(null);

  const handleInitiate = async (e) => {
    e.preventDefault();
    if (!user.transactionPasswordSet) {
      setError('You must set a transaction password in the Security Center before sending crypto.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await api.post('/transactions/initiate', {
        recipientAddress: txData.recipientAddress,
        amount: parseFloat(txData.amount),
        note: txData.note
      });
      
      if (res.data.success) {
        setRequestId(res.data.data.requestId);
        setRiskData({
          score: res.data.data.riskScore,
          flags: res.data.data.riskFlags,
          recommendation: res.data.data.riskRecommendation
        });
        setStep(2);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to initiate transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await api.post(`/transactions/${requestId}/verify-tx-password`, {
        transactionPassword: txPassword
      });
      
      if (res.data.success) {
        setCodeId(res.data.data.codeId);
        setStep(3);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await api.post(`/transactions/${requestId}/confirm`, {
        code: verificationCode
      });
      
      if (res.data.success) {
        setTxResult(res.data.data.transaction);
        setStep(4);
        fetchUser(); // Refresh balances
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setTxData({ recipientAddress: '', amount: '', note: '' });
    setTxPassword('');
    setVerificationCode('');
    setRequestId(null);
    setCodeId(null);
    setTxResult(null);
    setRiskData(null);
    setError('');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-outfit font-bold text-white mb-2">Send Crypto</h1>
        <p className="text-gray-400">Securely transfer SOL to any devnet wallet address.</p>
      </div>

      <div className="flex items-center justify-between mb-8 px-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex flex-col items-center relative z-10">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${
              step > s ? 'bg-indigo-500 text-white' : step === s ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/30' : 'bg-gray-800 text-gray-500'
            }`}>
              {step > s ? <CheckCircle2 className="w-6 h-6" /> : s}
            </div>
            <span className={`text-xs mt-2 font-medium ${step >= s ? 'text-indigo-300' : 'text-gray-600'}`}>
              {s === 1 ? 'Details' : s === 2 ? 'Password' : 'Verify'}
            </span>
          </div>
        ))}
        {/* Progress Line */}
        <div className="absolute left-[50%] -translate-x-[50%] w-full max-w-[400px] h-1 bg-gray-800 -z-0 top-[110px] sm:top-[125px] rounded-full overflow-hidden hidden sm:block">
          <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(step - 1) * 50}%` }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <Card>
              <CardHeader>
                <CardTitle>Transaction Details</CardTitle>
                <CardDescription>Enter the recipient's Solana wallet address and amount.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInitiate} className="space-y-4">
                  {error && <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}
                  
                  <div className="p-4 bg-indigo-900/20 border border-indigo-500/20 rounded-xl flex justify-between items-center mb-6">
                    <span className="text-gray-400 text-sm">Available Balance:</span>
                    <span className="text-lg font-bold text-indigo-300">{wallet?.balance?.toFixed(4) || '0'} SOL</span>
                  </div>

                  <div className="space-y-2">
                    <Label>Recipient Address</Label>
                    <Input 
                      placeholder="Paste Solana address here" 
                      value={txData.recipientAddress}
                      onChange={(e) => setTxData({...txData, recipientAddress: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Amount (SOL)</Label>
                    <div className="relative">
                      <Input 
                        type="number" 
                        step="0.000001" 
                        min="0.000001"
                        placeholder="0.00" 
                        className="pl-10"
                        value={txData.amount}
                        onChange={(e) => setTxData({...txData, amount: e.target.value})}
                        required
                      />
                      <div className="absolute left-3 top-2.5 text-gray-500 font-bold">$</div>
                      <div className="absolute right-3 top-2.5 text-xs font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300">SOL</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Note / Tags (Optional)</Label>
                    <Input 
                      placeholder="e.g. Payment for design work" 
                      value={txData.note}
                      onChange={(e) => setTxData({...txData, note: e.target.value})}
                    />
                  </div>

                  <Button type="submit" className="w-full mt-4" disabled={loading}>
                    {loading ? 'Analyzing...' : 'Continue to Verification'}
                    {!loading && <Send className="ml-2 w-4 h-4" />}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <Card>
              <CardHeader>
                <CardTitle>Verify Password</CardTitle>
                <CardDescription>Enter your transaction password to authorize this transfer.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleVerifyPassword} className="space-y-6">
                  {error && <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}
                  
                  {riskData && riskData.score > 30 && (
                    <div className={`p-4 rounded-xl border flex items-start space-x-3 ${riskData.recommendation === 'warn' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200' : 'bg-red-500/10 border-red-500/30 text-red-200'}`}>
                      {riskData.recommendation === 'warn' ? <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" /> : <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />}
                      <div>
                        <h4 className="font-semibold">{riskData.recommendation === 'warn' ? 'Unusual Activity Detected' : 'High Risk Transaction'}</h4>
                        <p className="text-sm opacity-80 mt-1">Our AI engine flagged this due to: {riskData.flags.join(', ')}. Please verify carefully before proceeding.</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-black/30 p-4 rounded-lg border border-white/5 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Amount</span><span className="font-bold text-white">{txData.amount} SOL</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-400">To</span><span className="font-mono text-xs text-indigo-300 w-32 truncate">{txData.recipientAddress}</span></div>
                  </div>

                  <div className="space-y-2">
                    <Label>Transaction Password</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      value={txPassword}
                      onChange={(e) => setTxPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="w-1/3" onClick={() => setStep(1)} disabled={loading}>Back</Button>
                    <Button type="submit" className="w-2/3" disabled={loading}>
                      {loading ? 'Verifying...' : 'Verify Password'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <Card>
              <CardHeader>
                <CardTitle>Email Verification</CardTitle>
                <CardDescription>A 6-digit code has been sent to your email. It expires in 60 seconds.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleConfirm} className="space-y-6">
                  {error && <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{error}</div>}
                  
                  <div className="flex justify-center py-4">
                    <ShieldCheck className="w-16 h-16 text-indigo-500 opacity-50" />
                  </div>

                  <div className="space-y-2 text-center">
                    <Label className="text-lg">Enter Verification Code</Label>
                    <Input 
                      className="text-center text-2xl font-mono tracking-[0.5em] h-14" 
                      maxLength="6"
                      placeholder="------"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full h-12 text-lg" disabled={loading || verificationCode.length !== 6}>
                    {loading ? 'Executing on Blockchain...' : 'Confirm & Send'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="border-green-500/30 shadow-green-500/10">
              <CardContent className="pt-10 pb-8 text-center space-y-6">
                <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto ring-8 ring-green-500/10">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                </div>
                
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">Transaction Sent!</h2>
                  <p className="text-gray-400">Successfully transferred {txData.amount} SOL</p>
                </div>

                <div className="bg-black/30 p-4 rounded-xl text-left space-y-3 inline-block w-full max-w-sm mx-auto border border-white/5">
                  <div><span className="text-xs text-gray-500 block mb-1">Transaction Hash</span><a href={`https://explorer.solana.com/tx/${txResult?.txHash}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-sm font-mono text-indigo-400 hover:underline break-all">{txResult?.txHash}</a></div>
                  <div><span className="text-xs text-gray-500 block mb-1">Network Fee</span><span className="text-sm text-white">{txResult?.networkFee} SOL</span></div>
                </div>

                <div className="pt-4 flex gap-4 justify-center">
                  <Button variant="outline" onClick={() => window.location.href = '/history'}>View History</Button>
                  <Button onClick={resetFlow}>Send Another</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
