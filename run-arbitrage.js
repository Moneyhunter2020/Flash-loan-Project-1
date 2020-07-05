// require('dotenv').config();

//INFURA_URL=wss://mainnet.infura.io/ws/v3/cb2055f0b31049a686260a7ecc23eb9f
const dotenv = require("dotenv");
dotenv.config();
const chalk = require('chalk');
const Web3 = require('web3');
const { ChainId, Token, TokenAmount, Pair } = require('@uniswap/sdk');
const abis = require('./abis');
const { mainnet: addresses } = require('./addresses');
const Flashloan =require('.build/comtracts/Flashloan.json');

const web3 = new Web3(
  new Web3.providers.WebsocketProvider(process.env.INFURA_URL)
);
web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);


const kyber = new web3.eth.Contract(
    abis.kyber.kyberNetworkProxy,
    addresses.kyber.kyberNetworkProxy
  );



const AMOUNT_ETH = 0.01;
const RECENT_ETH_PRICE = 230;
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString());
const AMOUNT_DAI_WEI = web3.utils.toWei((AMOUNT_ETH * RECENT_ETH_PRICE).toString());
const DIRECTION = {
  KYBER_TO_UNISWAP: 0,
  UNISWAP_TO_KYBER: 1
};


  const init = async () => {
    const [admin, _] = await web3.eth.getAccounts();
    const networkId = await web3.eth.net.getId();
    const flashloan = new web3.eth.Contract(
      Flashloan.abi,
      Flashloan.networks[networkId].address
  );

const init = async () => {
  const WETH = new Token(
    ChainId.MAINNET, 
    addresses.tokens.weth, 
    18, 
    'WETH', 
    'Wrapped Ether'
  );
}
  const DAI = new Token(
    ChainId.MAINNET, 
    addresses.tokens.dai, 
    18, 
    'DAI', 
    'Dai Stablecoin'
  );
  const [dai, weth] = await Promise.all(
    [addresses.tokens.dai, addresses.tokens.weth].map(tokenAddress => (
      Token.fetchData(
        ChainId.MAINNET,
        tokenAddress,
      )
  )));
  daiWeth = await Pair.fetchData(
    dai,
    weth,
  );

  web3.eth.subscribe('newBlockHeaders')
    .on('data', async block => {
      console.log(`New block received. Block # ${block.number}`);

      const kyberResults = await Promise.all([
          kyber
            .methods
            .getExpectedRate(
              addresses.tokens.dai, 
              '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 
              AMOUNT_DAI_WEI
            ) 
            .call(),
          kyber
            .methods
            .getExpectedRate(
              '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 
              addresses.tokens.dai, 
              AMOUNT_ETH_WEI
            ) 
            .call()
      ]);
      const kyberRates = {
        buy: parseFloat(1 / (kyberResults[0].expectedRate / (10 ** 18))),
        sell: parseFloat(kyberResults[1].expectedRate / (10 ** 18))
      };
      console.log(chalk.yellow('Kyber ETH/DAI'));
      
      console.log(chalk.green("   Buy:  " + kyberRates.buy));
      console.log(chalk.red("   Sell:  " + kyberRates.sell));

      const uniswapResults = await Promise.all([
        daiWeth.getOutputAmount(new TokenAmount(DAI, AMOUNT_DAI_WEI)),
        daiWeth.getOutputAmount(new TokenAmount(WETH, AMOUNT_ETH_WEI))
      ]);
    
      const uniswapRates = {
        buy: parseFloat( AMOUNT_DAI_WEI / (uniswapResults[0][0].toExact() * 10 ** 18)),
        sell: parseFloat(uniswapResults[1][0].toExact() / AMOUNT_ETH),
      };
      console.log(chalk.rgb(255,0,255)('Uniswap ETH/DAI'));
      console.log(chalk.green("   Buy:  " + uniswapRates.buy));
      console.log(chalk.red("   Sell:  " + uniswapRates.sell));

      //console.log(uniswapResults);

      const [tx1, tx2] = Object.keys(DIRECTION).map(direction => flashLoan.methods.initiateFlashloan(
        addresses.dydx.solo, 
        addresses.tokens.weth, 
        AMOUNT_ETH_WEI,
        DIRECTION[direction]
      ));
      const [gasPrice, gasCost1, gasCost2] = await Promise.all([
        web3.eth.getGasPrice(),
        tx1.estimateGas({from: admin}),
        tx2.estimateGas({from: admin})
      ]);
      const txCost1 = gasCost1 * parseInt(gasPrice);
      const txCost2 = gasCost2 * parseInt(gasPrice);
      
      const currentEthPrice = (uniswapRates.buy + uniswapRates.sell) / 2; 
      const profit1 = (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (uniswapRates.sell - kyberRates.buy) - (txCost / 10 ** 18) * currentEthPrice;
      const profit2 = (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (kyberRates.sell - uniswapRates.buy) - (txCost / 10 ** 18) * currentEthPrice;
      if(profit1 > 0) {
        console.log(chalk.blue('Arb opportunity found!'));
        console.log(chalk.green(`Buy ETH on Kyber at ${kyberRates.buy} dai`));
        console.log(chalk.magenta(`Sell ETH on Uniswap at ${uniswapRates.sell} dai`));
        console.log(chalk.cyanBright(`Expected profit: ${profit1} dai`));
        //Execute arb Kyber <=> Uniswap
        await tx1.send({
          from: admin,
          gas: gasCost,
          gasPrice,
          value: 2 //to pay for Flashloan cost
        });
       } else if(profit2 > 0) {
        console.log(chalk.blue('Arb opportunity found!'));
        console.log(chalk.green(`Buy ETH from Uniswap at ${uniswapRates.buy} dai`));
        console.log(chalk.magenta(`Sell ETH from Kyber at ${kyberRates.sell} dai`));
        console.log(chalk.cyanBright(`Expected profit: ${profit2} dai`));
        //Execute arb Uniswap <=> Kyber
        await tx2.send({
          from: admin,
          gas: gasCost,
          gasPrice,
          value: 2 //to pay for Flashloan cost
        });
      }
    })
    .on('error', error => {
      console.log(error);
    });
}
init();