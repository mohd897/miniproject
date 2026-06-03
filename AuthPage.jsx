import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Label } from '../components/ui/Label';
import { Lock, User, ArrowRight } from 'lucide-react';

export default function AuthPage() {
  const { simpleLogin } = useAuth();
  const navigate = useNavigate();
  
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    
    setError('');
    setLoading(true);

    try {
      const res = await simpleLogin(username.toLowerCase().trim());
      if (res.success) {
        navigate('/');
      } else {
        setError(res.message || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <Card className="border-white/10 shadow-2xl backdrop-blur-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-indigo-600 p-3 rounded-xl w-14 h-14 flex items-center justify-center mb-4 shadow-lg shadow-indigo-600/20">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl font-outfit mb-2">CryptoVault</CardTitle>
            <CardDescription className="text-base">
              Enter a username to access your vault. If it doesn't exist, an account will be automatically created for you.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                  <Input 
                    id="username" 
                    name="username" 
                    placeholder="Enter username..." 
                    className="pl-10" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <Button type="submit" className="w-full mt-6" disabled={loading}>
                {loading ? 'Entering Vault...' : 'Enter'}
                {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
