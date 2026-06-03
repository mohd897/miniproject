import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import api from '../utils/api';
import { ShieldCheck, KeyRound, Smartphone, AlertTriangle, Monitor } from 'lucide-react';
import { format } from 'date-fns';

export default function SecurityCenter() {
  const { user, fetchUser } = useAuth();
  
  const [txPassword, setTxPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await api.get('/auth/sessions');
      if (res.data.success) {
        setSessions(res.data.data.sessions);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetTxPassword = async (e) => {
    e.preventDefault();
    if (txPassword.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    
    setLoading(true);
    setMessage({ text: '', type: '' });
    
    try {
      const res = await api.post('/auth/set-transaction-password', { transactionPassword: txPassword });
      if (res.data.success) {
        setMessage({ text: 'Transaction password set successfully', type: 'success' });
        setTxPassword('');
        fetchUser(); // Refresh user state
      }
    } catch (err) {
      setMessage({ text: err.response?.data?.message || 'Failed to set password', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      fetchSessions();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-outfit font-bold text-white mb-2">Security Center</h1>
        <p className="text-gray-400">Manage your account security and active sessions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transaction Password Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <KeyRound className="w-5 h-5 mr-2 text-indigo-400" />
              Transaction Password
            </CardTitle>
            <CardDescription>
              {user?.transactionPasswordSet 
                ? 'Your transaction password is set. You can update it here.' 
                : 'Set a transaction password. This is required to send funds.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetTxPassword} className="space-y-4">
              {message.text && (
                <div className={`p-3 rounded-lg text-sm border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                  {message.text}
                </div>
              )}
              
              <div className="space-y-2">
                <Label>New Transaction Password</Label>
                <Input 
                  type="password" 
                  placeholder="At least 6 characters" 
                  value={txPassword}
                  onChange={(e) => setTxPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Saving...' : (user?.transactionPasswordSet ? 'Update Password' : 'Set Password')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2 text-green-400" />
              Security Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-black/30 rounded-xl border border-white/5">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${user?.isEmailVerified ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium text-white">Email Verification</span>
              </div>
              <span className={`text-sm ${user?.isEmailVerified ? 'text-green-400' : 'text-red-400'}`}>
                {user?.isEmailVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/30 rounded-xl border border-white/5">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${user?.transactionPasswordSet ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="font-medium text-white">Transaction Password</span>
              </div>
              <span className={`text-sm ${user?.transactionPasswordSet ? 'text-green-400' : 'text-yellow-400'}`}>
                {user?.transactionPasswordSet ? 'Set' : 'Not Set'}
              </span>
            </div>

            <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <div className="flex items-start space-x-3">
                <ShieldCheck className="w-5 h-5 text-indigo-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-indigo-200">Trust Score: {user?.trustScore}/100</h4>
                  <p className="text-sm text-indigo-300 mt-1">Your account has a good standing. Maintain safe transaction habits to keep this high.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Monitor className="w-5 h-5 mr-2 text-indigo-400" />
            Active Sessions
          </CardTitle>
          <CardDescription>Manage devices currently logged into your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session._id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-black/30 rounded-xl border border-white/5">
                <div className="flex items-center space-x-4 mb-4 md:mb-0">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                    {session.deviceType === 'mobile' ? <Smartphone className="w-5 h-5 text-gray-400" /> : <Monitor className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{session.browser || 'Unknown Browser'} on {session.deviceType === 'mobile' ? 'Mobile' : 'Desktop'}</h4>
                    <p className="text-xs text-gray-500 mt-1">IP: {session.ipAddress} • Last active: {format(new Date(session.lastActivity), 'MMM d, HH:mm')}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => revokeSession(session._id)} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
