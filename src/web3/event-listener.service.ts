// import { Injectable, OnModuleInit } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class Web3EventListener implements OnModuleInit {
//   // Constructor
//   constructor(private configService: ConfigService) {}

//   // ✅ Called when the module is initialized
//   async onModuleInit() {
//     console.log('🚀 Listening to burn events on Arbitrum & Optimism...');
//     await this.listenToBurnEvents(); // ✅ Best practice
//   }

//   async listenToBurnEvents() {
//     // ✅ Listen for burn events on Arbitrum
//     this.arbitrumContract.on('Transfer', async (from, to, value, event) => {
//       if (to === ethers.ZeroAddress) {
//         console.log(`🔥 Burn event on Arbitrum: ${value} tokens from ${from}`);
//         await this.handleBurnEvent(from, value, 'arbitrum');
//       }
//     });

//     // ✅ Listen for burn events on Optimism
//     this.optimismContract.on('Transfer', async (from, to, value, event) => {
//       if (to === ethers.ZeroAddress) {
//         console.log(`🔥 Burn event on Optimism: ${value} tokens from ${from}`);
//         await this.handleBurnEvent(from, value, 'optimism');
//       }
//     });

//     console.log('✅ Listening for burn events on Arbitrum & Optimism');
//   }
// }
