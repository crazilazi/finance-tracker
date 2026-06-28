import React from 'react';
import { Card, Button } from 'antd';
import { GithubOutlined } from '@ant-design/icons';

export default function Login() {
  const handleLogin = () => {
    // Redirect to the backend auth init endpoint
    window.location.href = '/api/auth/login';
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at top right, #1e1b4b, #0f172a 60%, #020617)',
      padding: 16,
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Background glowing blob */}
      <div style={{
        position: 'absolute',
        width: 300,
        height: 300,
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%)',
        top: '20%',
        left: '30%',
        filter: 'blur(40px)',
        pointerEvents: 'none'
      }} />

      <Card style={{
        width: 400,
        background: 'rgba(22, 29, 48, 0.7)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: 24,
        textAlign: 'center',
        padding: '32px 16px',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
      }} styles={{ body: {{ padding: 0 } }}}>
        {/* Brand Logo */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 900,
          fontSize: 28,
          margin: '0 auto 24px',
          boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
        }}>
          ₹
        </div>

        {/* Title */}
        <h1 style={{
          color: '#ffffff',
          fontSize: 26,
          fontWeight: 800,
          margin: '0 0 8px 0',
          letterSpacing: '-0.02em',
        }}>
          Finance Tracker
        </h1>

        {/* Description */}
        <p style={{
          color: '#9ca3af',
          fontSize: 14,
          lineHeight: 1.6,
          margin: '0 0 32px 0',
          padding: '0 16px'
        }}>
          A smart dashboard featuring real-time analytics, automated anomalies detection, and multi-user data isolation.
        </p>

        {/* OAuth Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button
            type="primary"
            icon={<GithubOutlined style={{ fontSize: 18 }} />}
            onClick={handleLogin}
            style={{
              height: 48,
              borderRadius: 12,
              background: '#24292e',
              borderColor: '#24292e',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              transition: 'all 0.3s ease'
            }}
            className="hover:scale-[1.02] active:scale-[0.98] hover:opacity-90"
          >
            Continue with GitHub
          </Button>
        </div>

        {/* Info Text */}
        <div style={{
          marginTop: 32,
          fontSize: 12,
          color: '#4b5563'
        }}>
          OAuth 2.0 Secure Session Connection
        </div>
      </Card>
    </div>
  );
}
