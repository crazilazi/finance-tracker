import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

// Dynamically import the App component to disable SSR since it's an SPA
const AppSPA = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0b0f19' }}>
      <Spin indicator={<LoadingOutlined style={{ fontSize: 48, color: '#6366f1' }} spin />} />
    </div>
  ),
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Finance Tracker</title>
      </Head>
      <AppSPA />
    </>
  );
}
