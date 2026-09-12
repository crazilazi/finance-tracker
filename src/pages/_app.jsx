import Head from 'next/head';
import { Provider } from 'react-redux';
import store from '../store';
import ThemeProvider from '../components/ThemeProvider';
import '../index.css';
import { App } from 'antd';

export default function MyApp({ Component, pageProps }) {
  return (
    <Provider store={store}>
      <Head>
        {/* viewport-fit=cover lets env(safe-area-inset-*) work in iOS PWA standalone mode */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <ThemeProvider>
        <App>
          <Component {...pageProps} />
        </App>
      </ThemeProvider>
    </Provider>
  );
}
