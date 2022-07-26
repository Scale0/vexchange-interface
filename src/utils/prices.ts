import { Percent, TokenAmount, Trade } from 'vexchange-sdk'
import { ALLOWED_SLIPPAGE_HIGH, ALLOWED_SLIPPAGE_LOW, ALLOWED_SLIPPAGE_MEDIUM } from '../constants'
import { Field } from '../state/swap/actions'
import { basisPointsToPercent } from './index'
import { abi as IVexchangeV2PairABI } from '../constants/abis/IVexchangeV2Pair.json'
import { find } from 'lodash'

export async function FetchSwapFee(pairAddress?: string, library?: any): Promise<Percent> {
  const abi = find(IVexchangeV2PairABI, { name: 'swapFee' })

  return new Promise(async (resolve, reject) => {
    const account = library.thor.account(pairAddress)
    const method = account.method(abi)

    try {
      const res = await method.call()
      resolve(basisPointsToPercent(res.decoded[0]))
    } catch (error) {
      reject(error)
    }
  })
}

// computes price breakdown for the trade
export function computeTradePriceBreakdown(
  trade?: Trade,
  swapFee?: Percent
): { priceImpactWithoutFee?: Percent; realizedLPFee?: TokenAmount } {
  swapFee = !trade ? undefined : swapFee
  // remove lp fees from price impact
  const priceImpactWithoutFeeFraction = trade?.slippage?.subtract(swapFee)

  // the x*y=k impact
  const priceImpactWithoutFeePercent = priceImpactWithoutFeeFraction
    ? new Percent(priceImpactWithoutFeeFraction?.numerator, priceImpactWithoutFeeFraction?.denominator)
    : undefined

  // the amount of the input that accrues to LPs
  const realizedLPFeeAmount =
    swapFee && new TokenAmount(trade.inputAmount.token, swapFee.multiply(trade.inputAmount.raw).quotient)

  return { priceImpactWithoutFee: priceImpactWithoutFeePercent, realizedLPFee: realizedLPFeeAmount }
}

// computes the minimum amount out and maximum amount in for a trade given a user specified allowed slippage in bips
export function computeSlippageAdjustedAmounts(
  trade: Trade,
  allowedSlippage: number
): { [field in Field]?: TokenAmount } {
  const pct = basisPointsToPercent(allowedSlippage)
  return {
    [Field.INPUT]: trade?.maximumAmountIn(pct),
    [Field.OUTPUT]: trade?.minimumAmountOut(pct)
  }
}

export function warningServerity(priceImpact: Percent): 0 | 1 | 2 | 3 {
  if (!priceImpact?.lessThan(ALLOWED_SLIPPAGE_HIGH)) return 3
  if (!priceImpact?.lessThan(ALLOWED_SLIPPAGE_MEDIUM)) return 2
  if (!priceImpact?.lessThan(ALLOWED_SLIPPAGE_LOW)) return 1
  return 0
}

export function formatExecutionPrice(trade?: Trade, inverted?: boolean): string {
  if (!trade) {
    return ''
  }
  return inverted
    ? `${trade.executionPrice.invert().toSignificant(6)} ${trade.inputAmount.token.symbol} / ${
        trade.outputAmount.token.symbol
      }`
    : `${trade.executionPrice.toSignificant(6)} ${trade.outputAmount.token.symbol} / ${trade.inputAmount.token.symbol}`
}
