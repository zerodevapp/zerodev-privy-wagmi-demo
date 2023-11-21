import type React from 'react';
import {type FC, useEffect, createContext, useContext, useRef, useState, useMemo} from 'react';
import {
  configureChains,
  createConfig,
  useWalletClient,
  WagmiConfig,
  type Connector,
  useSwitchNetwork as wagmiUseSwitchNetwork,
  useConnect,
  useAccount,
} from 'wagmi';

import {PrivyConnector} from './PrivyConnector';
import {type ConnectedWallet, usePrivy, useWallets} from '@privy-io/react-auth';

export type ConfigureChainsReturnType = ReturnType<typeof configureChains>;

export interface PrivyWagmiConnectorProps {
  children: React.ReactNode;
  wagmiChainsConfig: ConfigureChainsReturnType;
  privyConnectorOverride?: Connector;
}

type PrivyWagmiConnectorContext = {
  connector?: PrivyConnector;
};

const PrivyWagmiConnectorContext = createContext<PrivyWagmiConnectorContext>({});

export const PrivyWagmiConnector: FC<PrivyWagmiConnectorProps> = ({
  wagmiChainsConfig,
  privyConnectorOverride,
  children,
}) => {
  const {logout} = usePrivy();
  const {wallets} = useWallets();
  const {chains, publicClient} = wagmiChainsConfig;

  const connector = useMemo(() => {
    // If a connector override is provided that meets our required interface, use that.
    // This supports third-party integrations, like account abstraction, which may need to
    // override the PrivyConnector.
    if (privyConnectorOverride instanceof PrivyConnector) {
        console.log('Connector 1');
        return privyConnectorOverride;
    }
    // If no connector override is provided (the default), use our vanilla PrivyConnector.
    console.log('Connector 2');
    return new PrivyConnector({logout, chains});
  }, [privyConnectorOverride]);

  const config = useRef(
    createConfig({
      autoConnect: true,
      connectors: [connector],
      publicClient,
    }),
  );

  useEffect(() => {
    (async () => {
      const wallet = wallets[0];
      if (!wallet) return;

      await connector.setActiveWallet(wallet);
    })();
  }, [wallets.length]);

  useEffect(() => {
    (async () => {
      const activeWallet = connector.getActiveWallet();
      if (activeWallet && (await activeWallet.isConnected())) return;

      const wallet = wallets[0];
      if (!wallet) return;

      await connector.setActiveWallet(wallet);
    })();
  }, [wallets]);

  return (
    <PrivyWagmiConnectorContext.Provider value={{connector: connector}}>
      <WagmiConfig config={config.current}>{children}</WagmiConfig>
    </PrivyWagmiConnectorContext.Provider>
  );
};

export const usePrivyWagmi = () => {
  const {connector} = useContext(PrivyWagmiConnectorContext);
  const {wallets} = useWallets();
  const [wallet, setWallet] = useState<ConnectedWallet>();
  const {refetch} = useWalletClient();
  const {isConnected} = useAccount();
  const {connect, connectors, isLoading} = useConnect({connector});

  useEffect(() => {
    const updateActiveWallet = () => {
      const activeWallet = connector!.getActiveWallet();
      const wallet = wallets.find(
        (w) =>
          w.address === activeWallet?.address &&
          w.connectorType === activeWallet.connectorType &&
          w.walletClientType === activeWallet.walletClientType,
      );
      setWallet(wallet ?? activeWallet);
    };

    updateActiveWallet();
    connector!.on('change', updateActiveWallet);

    return () => {
      connector!.off('change', updateActiveWallet);
    };
  }, [wallets, isConnected, connectors, isLoading]);

  useEffect(() => {
    if (!isConnected && !isLoading && connectors.length && wallet) connect();
    refetch();
  }, [wallet]);

  const setActiveWallet = async (wallet: ConnectedWallet) => connector!.setActiveWallet(wallet);

  return {
    ready: connector!.ready,
    wallet,
    setActiveWallet,
  };
};

export const useSwitchNetwork = (opts: Parameters<typeof wagmiUseSwitchNetwork>[0]) => {
  return wagmiUseSwitchNetwork({
    throwForSwitchChainNotSupported: true,
    ...opts,
  });
};