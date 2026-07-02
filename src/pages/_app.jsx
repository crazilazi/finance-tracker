import { Provider } from 'react-redux';
import store from '../store';
import ThemeProvider from '../components/ThemeProvider';
import '../index.css';
import { App } from 'antd';

export default function MyApp({ Component, pageProps }) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <App>
          <Component {...pageProps} />
        </App>
      </ThemeProvider>
    </Provider>
  );
}
