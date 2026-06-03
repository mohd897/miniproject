import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Wallet, ArrowUpRight, ArrowDownRight, Activity, ShieldAlert, CreditCard } from 'lucide-react';
import api from '../utils/api';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { user, wallet } = useAuth();
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, analyticsRes] = await Promise.all([
          api.get('/wallet/stats'),
          api.get('/transactions/analytics?days=7')
        ]);
        
        if (statsRes.data.success) {
          setStats(statsRes.data.data);
        }
        if (analyticsRes.data.success) {
          // Format chart data
          const formatted = analyticsRes.data.data.dailyVolume.map(item => ({
            name: item._id.split('-').slice(1).join('/'), // MM/DD
            volume: item.volume
          }));
          setChartData(formatted);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const [addingFunds, setAddingFunds] = useState(false);

  const handleAddFunds = async () => {
    try {
      setAddingFunds(true);
      const res = await api.post('/wallet/add-funds', { amount: 100 });
      if (res.data.success) {
        setStats(prev => ({ 
          ...prev, 
          balance: res.data.data.balance,
          balanceUSD: res.data.data.balanceUSD
        }));
      }
    } catch (error) {
      console.error('Failed to add funds', error);
    } finally {
      setAddingFunds(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Wallet address copied to clipboard');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (loading) {
    return <div className="animate-pulse space-y-6">
      <div className="h-32 bg-white/5 rounded-xl"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-40 bg-white/5 rounded-xl"></div>
        <div className="h-40 bg-white/5 rounded-xl"></div>
        <div className="h-40 bg-white/5 rounded-xl"></div>
      </div>
    </div>;
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={itemVariants} className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-outfit font-bold tracking-tight text-white mb-2">Overview</h1>
          <p className="text-gray-400">Welcome back, {user?.fullName}. Here is your wallet summary.</p>
        </div>
        <button 
          onClick={handleAddFunds}
          disabled={addingFunds}
          className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
        >
          <ArrowDownRight className="w-4 h-4 mr-2" />
          {addingFunds ? 'Adding...' : 'Add 100 SOL'}
        </button>
      </motion.div>

      {/* Main Balance Card */}
      <motion.div variants={itemVariants}>
        <Card className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border-indigo-500/30 shadow-2xl shadow-indigo-500/10">
          <CardContent className="p-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-2">
              <p className="text-indigo-200 font-medium flex items-center">
                <Wallet className="w-5 h-5 mr-2" />
                Total Balance
              </p>
              <h2 className="text-5xl font-bold text-white tracking-tight">
                {stats?.balance?.toFixed(4) || '0.0000'} <span className="text-2xl text-indigo-300">SOL</span>
              </h2>
              <p className="text-gray-400">≈ ${stats?.balanceUSD?.toFixed(2) || '0.00'} USD</p>
            </div>
            
            <div className="bg-black/40 p-4 rounded-xl border border-white/10 backdrop-blur-md min-w-[300px]">
              <p className="text-sm text-gray-400 mb-1">Your Wallet Address (Demo)</p>
              <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5 font-mono text-sm">
                <span className="truncate w-48 text-indigo-300">{wallet?.publicKey}</span>
                <button onClick={() => copyToClipboard(wallet?.publicKey)} className="text-gray-400 hover:text-white transition-colors ml-2">
                  Copy
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Total Sent</CardTitle>
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-red-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalSent?.toFixed(2) || '0.00'} SOL</div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Total Received</CardTitle>
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4 text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalReceived?.toFixed(2) || '0.00'} SOL</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Trust Score</CardTitle>
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end space-x-2">
                <div className="text-2xl font-bold text-blue-400">{user?.trustScore}</div>
                <div className="text-sm text-gray-500 mb-1">/ 100</div>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full mt-3 overflow-hidden">
                <div 
                  className={`h-full rounded-full ${user?.trustScore > 80 ? 'bg-green-500' : user?.trustScore > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${user?.trustScore}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Chart Section */}
      <motion.div variants={itemVariants}>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Activity className="w-5 h-5 mr-2 text-indigo-400" />
              Transaction Volume (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} SOL`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      itemStyle={{ color: '#818cf8' }}
                    />
                    <Line type="monotone" dataKey="volume" stroke="#818cf8" strokeWidth={3} dot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 border border-dashed border-white/10 rounded-xl">
                  No transaction data available for the last 7 days.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
