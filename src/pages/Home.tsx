import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { usePrivyWagmi } from '@privy-io/wagmi-connector';

import { UseAccount } from '../components/UseAccount';

function App() {
  const navigate = useNavigate()
  const { ready, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();
  const { wallet: activeWallet, setActiveWallet } = usePrivyWagmi();

  useEffect(() => {
    if (wallets[0] && !activeWallet) {
        setActiveWallet(wallets[0]);
    }
  }, [activeWallet, wallets, setActiveWallet]);

  useEffect(() => {
    if (ready && !authenticated) {
      navigate("/login");
    }
  }, [ready, authenticated, navigate]);

  return (
    <div className="App">
      <div>
        Authenticated: {authenticated.toString()}
        <br />
        {authenticated && <button onClick={() => logout()}>logout</button>}
      </div>
      {ready && authenticated && (
        <>
          <UseAccount />
        </>
      )}
    </div>
  );
}

export default App;
