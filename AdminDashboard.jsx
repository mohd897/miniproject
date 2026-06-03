import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import api from '../utils/api';
import { Users, Activity, ShieldAlert, Zap, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const [dashboardRes, analyticsRes] = await Promise.all([
          api.get('/admin/dashboard'),
          api.get('/admin/analytics')
        ]);
        
        if (dashboardRes.data.success && analyticsRes.data.success) {
          setData({
            ...dashboardRes.data.data,
            analytics: analyticsRes.data.data
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, []);

  if (loading || !data) {
    return <div className="animate-pulse space-y-6">
      <div className="h-8 w-64 bg-white/5 rounded"></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-white/5 rounded-xl"></div>)}
      </div>
      <div className="h-96 bg-white/5 rounded-xl"></div>
    </div>;
  }

  const chartData = data.analytics.dailyVolume.map(item => ({
    name: item._id.split('-').slice(1).join('/'),
    volume: item.volume
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-outfit font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-gray-400">Platform overview and risk monitoring.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-400">Total Users</p>
                <h3 className="text-3xl font-bold text-white mt-2">{data.stats.users.total}</h3>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg"><Users className="w-5 h-5 text-blue-400" /></div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-400">Total Volume</p>
                <h3 className="text-3xl font-bold text-white mt-2">{data.stats.volume.total.toFixed(2)} SOL</h3>
              </div>
              <div className="p-3 bg-indigo-500/10 rounded-lg"><Zap className="w-5 h-5 text-indigo-400" /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-400">Flagged TXs</p>
                <h3 className="text-3xl font-bold text-red-400 mt-2">{data.stats.transactions.flagged}</h3>
              </div>
              <div className="p-3 bg-red-500/10 rounded-lg"><ShieldAlert className="w-5 h-5 text-red-400" /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-400">Frozen Accounts</p>
                <h3 className="text-3xl font-bold text-yellow-400 mt-2">{data.stats.users.frozen}</h3>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded-lg"><AlertTriangle className="w-5 h-5 text-yellow-400" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Platform Volume (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                  <Bar dataKey="volume" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.recentUsers.map(u => (
                <div key={u._id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                  <div>
                    <p className="font-medium text-white">{u.username}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-bold ${u.isFrozen ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    {u.isFrozen ? 'Frozen' : 'Active'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
