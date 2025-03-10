import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { Web3Service } from '../web3/web3.service';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';

class BurnRequestDto {
  user: string;
  selectedNetwork: 'arbitrum' | 'optimism';
  contractAddress: string;
  amount: string;
  signature: string;
}

@ApiTags('bridge')
@Controller('bridge')
export class BridgeController {
  constructor(private readonly web3Service: Web3Service) {}

  @Get('/balance/:userAddress')
  @ApiOperation({ summary: 'Get User Balance' })
  @ApiParam({
    name: 'userAddress',
    required: true,
    description: 'User wallet address',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the balance of user on both networks',
  })
  async getUserBalance(@Param('userAddress') userAddress: string) {
    return await this.web3Service.getUserBalance(userAddress);
  }

  @Post('/burn')
  @ApiOperation({ summary: 'Burn Tokens' })
  @ApiBody({ type: BurnRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Burn transaction submitted via Gelato Relay.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or transaction failed.',
  })
  async burnTokens(@Body() body: BurnRequestDto) {
    return this.web3Service.burnTokens(
      body.user,
      body.amount,
      body.selectedNetwork,
      body.signature,
    );
  }

  // @Post('/mint')
  // @ApiOperation({ summary: 'Mint tokens' })
  // @ApiBody({
  //   schema: {
  //     type: 'object',
  //     properties: {
  //       user: { type: 'string', description: 'User wallet address' },
  //       amount: { type: 'number', description: 'Amount to burn' },
  //       network: {
  //         type: 'string',
  //         enum: ['arbitrum', 'optimism'],
  //         description: 'Source network',
  //       },
  //     },
  //   },
  // })
  // @ApiResponse({ status: 201, description: 'Mint successful' })
  // async mintTokens(
  //   @Body()
  //   {
  //     user,
  //     amount,
  //     network,
  //   }: {
  //     user: string;
  //     amount: string;
  //     network: 'arbitrum' | 'optimism';
  //   },
  // ) {
  //   return await this.web3Service.mintTokensUsingGelato(user, amount, network);
  // }
}
