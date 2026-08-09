'use client';

import type { FormEvent } from 'react';
import React, { useState } from 'react';
import { Zap, Mail, Lock, User as UserIcon, Loader2, Eye, EyeOff, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { login, register } from '@/lib/auth';

interface AuthPageProps {
  onSuccess: () => void;
  initialMode?: 'login' | 'register';
  onClose?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess, initialMode = 'login', onClose }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwordValid, setPasswordValid] = useState(false);
  const [emailValid, setEmailValid] = useState(false);

  const validateEmail = (value: string) => {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    setEmailValid(valid);
  };

  const validatePassword = (value: string) => {
    setPasswordValid(value.length >= 8);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!emailValid) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!passwordValid) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        setSuccess('Login successful! Redirecting...');
      } else {
        await register(email, password, name.trim());
        setSuccess('Registration successful! Redirecting...');
      }
      setTimeout(onSuccess, 800);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
    setPasswordValid(false);
  };

  const inputClassName = (hasError?: boolean) =>
    `w-full pl-11 pr-10 py-3 rounded-xl bg-pitch-surface border text-sm font-medium transition-all
    placeholder:text-zinc-600 focus:outline-none focus:ring-2 ${
      hasError
        ? 'border-red-500/50 focus:ring-red-500/30'
        : 'border-pitch-border focus:border-electric-blue/50 focus:ring-electric-blue/20'
    } text-zinc-100`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-pitch-bg/90 backdrop-blur-md fixed inset-0 z-50 p-4 overflow-y-auto">
      {/* Background Glow Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-electric-blue/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-neon-purple/10 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md my-8">
        {/* Close Button if rendered as modal */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-12 right-0 p-2 text-zinc-400 hover:text-white transition-colors rounded-full bg-zinc-800/80 border border-zinc-700/60"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-electric-blue via-indigo-600 to-neon-purple flex items-center justify-center shadow-xl glow-blue">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-extrabold tracking-wider text-white flex items-center gap-2">
                QIS
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-electric-blue/20 text-electric-blue border border-electric-blue/30">
                  PRO
                </span>
              </h1>
              <p className="text-xs text-zinc-500 font-medium">AI-Assisted Grid Trading</p>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-zinc-100">
            {mode === 'login' ? 'Welcome Back to Qis' : 'Create Your Trading Account'}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {mode === 'login'
              ? 'Sign in to access your AI trading dashboard'
              : 'Set up your account to start AI-assisted grid trading'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-pitch-card border border-pitch-border rounded-2xl p-6 shadow-2xl relative">
          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-300">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name - Register Only */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Trader"
                    className={inputClassName()}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    validateEmail(e.target.value);
                  }}
                  placeholder="you@example.com"
                  className={inputClassName(email.length > 0 && !emailValid)}
                  disabled={loading}
                />
                {email.length > 0 && emailValid && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    validatePassword(e.target.value);
                  }}
                  placeholder="Minimum 8 characters"
                  className={inputClassName(password.length > 0 && !passwordValid)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password.length > 0 && !passwordValid && (
                <p className="mt-1 text-[11px] text-red-400">
                  Password must be at least 8 characters long
                </p>
              )}
            </div>

            {/* Confirm Password - Register Only */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={inputClassName(
                      confirmPassword.length > 0 && password !== confirmPassword
                    )}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="mt-1 text-[11px] text-red-400">Passwords do not match</p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-electric-blue to-neon-purple text-white font-semibold text-sm
                hover:opacity-90 transition-all shadow-lg glow-blue disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : mode === 'login' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Switch Mode */}
          <div className="mt-6 pt-6 border-t border-pitch-border text-center">
            {mode === 'login' ? (
              <p className="text-sm text-zinc-500">
                Don't have an account?{' '}
                <button
                  onClick={() => switchMode('register')}
                  className="text-electric-blue hover:text-electric-blue/80 font-semibold transition-colors cursor-pointer"
                >
                  Create one
                </button>
              </p>
            ) : (
              <p className="text-sm text-zinc-500">
                Already have an account?{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="text-electric-blue hover:text-electric-blue/80 font-semibold transition-colors cursor-pointer"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-zinc-600 mt-6">
          AI analyzes · AI recommends · Trader decides · System executes
        </p>
      </div>
    </div>
  );
};