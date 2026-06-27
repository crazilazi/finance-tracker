import { Provider } from 'react-redux';
import store from '../store';
import ThemeProvider from '../components/ThemeProvider';
import '../index.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <Component {...pageProps} />
      </ThemeProvider>
    </Provider>
  );
}
