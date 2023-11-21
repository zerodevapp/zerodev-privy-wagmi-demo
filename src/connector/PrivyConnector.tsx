import {
    ConnectorData,
    Address,
    Chain,
    Connector,
    ChainNotConfiguredError,
    ConnectorNotFoundError,
    WalletClient
  } from 'wagmi';
  import {
    getAddress,
    createWalletClient,
    custom,
    numberToHex,
    ProviderRpcError,
    UserRejectedRequestError,
    SwitchChainError,
  } from 'viem';
  import type {EIP1193Provider, ConnectedWallet} from '@privy-io/react-auth';
  
  export function normalizeChainId(chainId: string | number | bigint) {
    if (typeof chainId === 'string')
      return Number.parseInt(chainId, chainId.trim().substring(0, 2) === '0x' ? 16 : 10);
    if (typeof chainId === 'bigint') return Number(chainId);
    return chainId;
  }
  
  export class PrivyConnector extends Connector {
    ready = false;
    readonly id = 'privy';
    readonly name = 'Privy';
  
    protected activeWallet?: ConnectedWallet;
    protected provider?: EIP1193Provider;
    protected readonly logoutFromPrivy: () => Promise<void>;
  
    constructor({
      logout,
      chains,
      activeWallet,
    }: {
      logout: () => Promise<void>;
      chains?: Chain[];
      activeWallet?: ConnectedWallet;
    }) {
      super({chains, options: undefined});
  
      this.logoutFromPrivy = logout;
      this.activeWallet = activeWallet;
      if (this.activeWallet) this.ready = true;
    }
  
    getActiveWallet() {
      return this.activeWallet;
    }
  
    async setActiveWallet(wallet: ConnectedWallet) {
      if (
        this.activeWallet?.connectorType === wallet.connectorType &&
        this.activeWallet?.walletClientType === wallet.walletClientType &&
        this.activeWallet?.address === wallet.address
      ) {
        return;
      }
  
      this.activeWallet = wallet;
  
      // switch to the same chain as the original wallet
      const originalChainId = await this.getChainId();
      await this.#cycleProvider();
      const newProviderChainId = await this.getChainId();
      if (originalChainId && originalChainId !== newProviderChainId) {
        try {
          await this.switchChain(originalChainId);
        } catch {
          console.warn('Unable to switch new active wallet to network of previously active wallet.');
        }
      }
  
      this.onAccountsChanged([this.activeWallet.address]);
    }
  
    async connect({chainId}: {chainId?: number} = {}): Promise<Required<ConnectorData>> {
      this.emit('message', {type: 'connecting'});
      const account = await this.getAccount();
  
      await this.#cycleProvider();
  
      let id = await this.getChainId();
      let unsupported = this.isChainUnsupported(id); // this is based on the chains passed in the wagmi config
      if (chainId && id !== chainId) {
        const chain = await this.switchChain(chainId);
        id = chain.id;
        unsupported = this.isChainUnsupported(id);
      }
      return {
        account,
        chain: {id, unsupported},
      };
    }
  
    async disconnect() {
      if (this.provider) {
        this.#unsubscribeProviderListeners(this.provider);
      }
  
      await this.logoutFromPrivy();
    }
  
    async getAccount(): Promise<Address> {
      if (!this.activeWallet) throw new ConnectorNotFoundError();
      return getAddress(this.activeWallet.address);
    }
  
    async getChainId() {
      const provider = await this.getProvider();
      const chainId = (await provider.request({
        method: 'eth_chainId',
      })) as number;
  
      return normalizeChainId(chainId);
    }
  
    async getProvider() {
      if (!this.activeWallet) throw new ConnectorNotFoundError();
  
      if (!this.provider) {
        try {
          const provider = await this.activeWallet.getEthereumProvider();
          this.provider = provider;
        } catch {
          throw new ConnectorNotFoundError();
        }
      }
      return this.provider;
    }
  
    async getWalletClient({chainId}: {chainId?: number} = {}): Promise<WalletClient> {
      const [provider, account] = await Promise.all([this.getProvider(), this.getAccount()]);
      const chain = this.chains.find((x) => x.id === chainId);
  
      return createWalletClient({
        account,
        chain,
        transport: custom(provider),
      }) as WalletClient;
    }
  
    async isAuthorized(): Promise<boolean> {
      const [provider, account, isConnected] = await Promise.all([
        this.getProvider(),
        this.getAccount(),
        this.activeWallet?.isConnected(),
      ]);
      return !!account && !!provider && !!isConnected;
    }
  
    override async switchChain(chainId: number) {
      const provider = await this.getProvider();
      const id = numberToHex(chainId);
  
      try {
        const chainChangePromise = new Promise<void>((resolve) => {
          const handler = ({chain}: {chain?: {id: number}}) => {
            if (chain?.id !== chainId) return;
  
            this.off('change', handler);
            resolve();
          };
  
          this.on('change', handler);
        });
  
        await Promise.all([
          chainChangePromise,
          provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{chainId: id.toString()}],
          }),
        ]);
  
        return (
          this.chains.find((x) => x.id === chainId) ?? {
            id: chainId,
            name: `Chain ${id}`,
            network: `${id}`,
            nativeCurrency: {name: 'Ether', decimals: 18, symbol: 'ETH'},
            rpcUrls: {default: {http: ['']}, public: {http: ['']}},
          }
        );
      } catch (error) {
        const chain = this.chains.find((x) => x.id === chainId);
        if (!chain) throw new ChainNotConfiguredError({chainId, connectorId: this.id});
  
        // Indicates chain is not added to provider
        // attempt adding it as a basic EVM chain
        if ((error as ProviderRpcError).code === 4902) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: id,
                  chainName: chain.name,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrls: [chain.rpcUrls.public?.http[0] ?? ''],
                  blockExplorerUrls: this.getBlockExplorerUrls(chain),
                },
              ],
            });
            return chain;
          } catch (error) {
            throw new UserRejectedRequestError(error as Error);
          }
        }
  
        if (this.#isUserRejectedRequestError(error))
          throw new UserRejectedRequestError(error as Error);
        throw new SwitchChainError(error as Error);
      }
    }
  
    protected onAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) this.emit('disconnect');
      else {
        this.emit('change', {account: getAddress(this.activeWallet!.address)});
      }
    }
  
    protected onChainChanged = (chainId: number | string) => {
      const id = normalizeChainId(chainId);
      const unsupported = this.isChainUnsupported(id);
      this.emit('change', {chain: {id, unsupported}});
    };
  
    protected async onDisconnect(error?: Error) {
      if ((error as ProviderRpcError)?.code === 1013) {
        const provider = await this.getProvider();
        if (provider) {
          const isAuthorized = await this.getAccount();
          if (isAuthorized) return;
        }
      }
  
      this.ready = false;
      this.emit('disconnect');
    }
  
    // Error message parser
    #isUserRejectedRequestError(error: unknown) {
      return /(user rejected)/i.test((error as Error).message);
    }
  
    #subscribeProviderListeners(provider: EIP1193Provider) {
      provider.on('accountsChanged', this.onAccountsChanged.bind(this));
      provider.on('chainChanged', this.onChainChanged);
      provider.on('disconnect', this.onDisconnect.bind(this));
    }
  
    #unsubscribeProviderListeners(provider: EIP1193Provider) {
      provider.removeListener('accountsChanged', this.onAccountsChanged.bind(this));
      provider.removeListener('chainChanged', this.onChainChanged);
      provider.removeListener('disconnect', this.onDisconnect.bind(this));
    }
  
    // Each Privy wallet has a unique provider. When a new wallet is activated,
    // we want to unsubscribe all the listeners we've added and subscribe to
    // to the new provider's events.
    async #cycleProvider() {
      const oldProvider = this.provider;
      this.provider = undefined;
      const newProvider = await this.getProvider();
  
      if (oldProvider) {
        this.#unsubscribeProviderListeners(oldProvider);
      }
  
      this.#subscribeProviderListeners(newProvider);
      this.ready = true;
    }
  }