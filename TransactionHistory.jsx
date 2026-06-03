import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import api from '../utils/api';
import { ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, XCircle, AlertTriangle, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';

export default function TransactionHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, sent, received

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await api.get(`/transactions?limit=50${filter !== 'all' ? `&type=${filter}` : ''}`);
        if (res.data.success) {
          setTransactions(res.data.data.transactions);
        }
      } catch (error) {
        console.error("Failed to fetch transactions", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [filter]);

  const getStatusIcon = (status) => {
    switch(status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'pending':
      case 'processing': return <Clock className="w-5 h-5 text-yellow-500" />;
      default: return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-outfit font-bold text-white mb-2">Transaction History</h1>
          <p className="text-gray-400">View and track all your Solana transactions.</p>
        </div>
        
        <div className="flex gap-2 p-1 bg-black/40 rounded-lg border border-white/10 backdrop-blur-md">
          {['all', 'sent', 'received'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-400 bg-black/20 border-b border-white/5 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Address</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500 animate-pulse">Loading transactions...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <Search className="w-10 h-10 mb-3 opacity-20" />
                      <p>No transactions found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isSent = tx.sender?._id === user?._id;
                  
                  return (
                    <tr key={tx._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSent ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                            {isSent ? <ArrowUpRight className="w-4 h-4 text-red-400" /> : <ArrowDownRight className="w-4 h-4 text-green-400" />}
                          </div>
                          <span className="font-medium text-white">{isSent ? 'Sent' : 'Received'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${isSent ? 'text-white' : 'text-green-400'}`}>
                          {isSent ? '-' : '+'}{tx.amount} SOL
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-indigo-300 w-24 truncate" title={isSent ? tx.receiverWallet : tx.senderWallet}>
                            {isSent ? tx.receiverWallet : tx.senderWallet}
                          </span>
                          <span className="text-xs text-gray-500 mt-1">{isSent ? tx.receiver?.username || 'External' : tx.sender?.username || 'External'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-400">
                        {format(new Date(tx.createdAt), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(tx.status)}
                          <span className="capitalize">{tx.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {tx.txHash ? (
                          <a href={`https://explorer.solana.com/tx/${tx.txHash}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 font-medium text-xs border border-indigo-500/30 px-3 py-1 rounded-full hover:bg-indigo-500/10 transition-colors">
                            Explorer
                          </a>
                        ) : (
                          <span className="text-gray-500 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
