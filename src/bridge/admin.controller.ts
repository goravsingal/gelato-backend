import { Controller, Get, Post, Body } from '@nestjs/common';
import { Web3Service } from '../web3/web3.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('Bridge Operator')
@Controller('operator')
export class AdminController {
  constructor(private readonly web3Service: Web3Service) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get Bridge Operator Balance' })
  async getSelfBalance() {
    return await this.web3Service.getSelfBalance();
  }

  @Post('/self-mint')
  @ApiOperation({ summary: 'Self mint tokens as bridge operator' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to burn' },
        network: {
          type: 'string',
          enum: ['arbitrum', 'optimism'],
          description: 'Source network',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Mint successful' })
  async selfMintTokens(
    @Body()
    { amount, network }: { amount: bigint; network: 'arbitrum' | 'optimism' },
  ) {
    return await this.web3Service.selfMintTokens(amount, network);
  }

  @Post('/mint')
  @ApiOperation({ summary: 'Mint tokens as bridge operator' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'User wallet address' },
        amount: { type: 'number', description: 'Amount to burn' },
        network: {
          type: 'string',
          enum: ['arbitrum', 'optimism'],
          description: 'Source network',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Mint successful' })
  async mintTokens(
    @Body()
    {
      user,
      amount,
      network,
    }: {
      user: string;
      amount: bigint;
      network: 'arbitrum' | 'optimism';
    },
  ) {
    return await this.web3Service.mintTokensToUser(
      user,
      amount.toString(),
      network,
    );
  }
}
