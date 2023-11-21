import React from 'react';
import ReactDOM from 'react-dom/client';

import {goerli, polygonMumbai} from '@wagmi/chains';
import {PrivyProvider} from '@privy-io/react-auth';
// Note: importing this from the local connector file for testing
import {ZeroDevPrivyWagmiProvider} from './connector/ZeroDevPrivyWagmiProvider';
import {configureChains} from 'wagmi';
import {publicProvider} from 'wagmi/providers/public';

import App from './App';
import reportWebVitals from './reportWebVitals';

import './index.css';
import { PRIVY_APP_ID, ZERODEV_PROJECT_IDS } from './constants';

const configureChainsConfig = configureChains([polygonMumbai, goerli], [publicProvider()]);
const zeroDevOptions = {
  projectIds: ZERODEV_PROJECT_IDS,
  projectId: ZERODEV_PROJECT_IDS[0],
  useSmartWalletForExternalEOA: true,
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        embeddedWallets: {
          createOnLogin: 'all-users',
          requireUserPasswordOnCreate: false
        },
        defaultChain: polygonMumbai,
        supportedChains: [polygonMumbai, goerli]
      }}
    >
      <ZeroDevPrivyWagmiProvider wagmiChainsConfig={configureChainsConfig} options={zeroDevOptions}>
        <App />
      </ZeroDevPrivyWagmiProvider>
    </PrivyProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
