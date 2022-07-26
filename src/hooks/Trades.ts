import { useMemo } from 'react'
import { WVET, Token, TokenAmount, Trade, ChainId, Pair, Route, TradeType } from 'vexchange-sdk'
import { useWeb3React } from './index'
import { usePair } from '../data/Reserves'
import { DUMMY_VET } from '../constants'

const VTHO = new Token(ChainId.MAINNET, '0x0000000000000000000000000000456E65726779', 18, 'VTHO', 'VeThor')

function useAllCommonPairs(tokenA?: Token, tokenB?: Token): Pair[] {
  const { chainId } = useWeb3React()

  // check for direct pair between tokens
  const pairBetween = usePair(tokenA, tokenB)

  // get token<->WVET pairs
  const aToWVET = usePair(tokenA, WVET[chainId])
  const bToWVET = usePair(tokenB, WVET[chainId])

  // get token<->VTHO pairs
  const aToVTHO = usePair(tokenA, chainId === ChainId.MAINNET ? VTHO : undefined)
  const bToVTHO = usePair(tokenB, chainId === ChainId.MAINNET ? VTHO : undefined)

  // get connecting pairs
  const VTHOToWVET = usePair(chainId === ChainId.MAINNET ? VTHO : undefined, WVET[chainId])

  // only pass along valid pairs, non-duplicated pairs
  return useMemo(
    () =>
      [pairBetween, aToWVET, bToWVET, aToVTHO, bToVTHO, VTHOToWVET]
        // filter out invalid pairs
        .filter(p => !!p)
        // filter out duplicated pairs
        .filter(
          (p, i, pairs) => i === pairs.findIndex(pair => pair?.liquidityToken.address === p.liquidityToken.address)
        ),
    [pairBetween, aToWVET, bToWVET, aToVTHO, bToVTHO, VTHOToWVET]
  )
}

/**
 * Returns the best trade for the exact amount of tokens in to the given token out
 */
export function useTradeExactIn(amountIn?: TokenAmount, tokenOut?: Token): Trade | null {
  const inputToken = amountIn?.token
  const outputToken = tokenOut

  const tokenOutVet = tokenOut?.equals(DUMMY_VET[outputToken.chainId])
  const tokenInVet = inputToken?.equals(DUMMY_VET[inputToken.chainId])

  const tokenOutWvet = tokenOut?.equals(WVET[outputToken.chainId])
  const tokenInWvet = inputToken?.equals(WVET[inputToken.chainId])

  const allowedPairs = useAllCommonPairs(inputToken, outputToken)

  return useMemo(() => {
    if (amountIn && tokenOut && allowedPairs.length > 0) {
      if (tokenInVet && !tokenOutVet && !tokenOutWvet) {
        amountIn.token = WVET[inputToken.chainId]
        const trade =
          Trade.bestTradeExactIn(allowedPairs, amountIn, tokenOut, {
            maxHops: 1,
            maxNumResults: 1
          })[0] ?? null
        if (trade) {
          trade.inputAmount.token = DUMMY_VET[inputToken.chainId]
          return trade
        } else {
          return null
        }
      } else if (!tokenInVet && !tokenInWvet && tokenOutVet) {
        const trade =
          Trade.bestTradeExactIn(allowedPairs, amountIn, WVET[outputToken.chainId], {
            maxHops: 1,
            maxNumResults: 1
          })[0] ?? null
        if (trade) {
          trade.outputAmount.token = DUMMY_VET[outputToken.chainId]
          return trade
        } else {
          return null
        }
      } else if ((tokenInVet && tokenOutWvet) || (tokenInWvet && tokenOutVet)) {
        const amountOut = new TokenAmount(tokenOut, amountIn.raw)
        const route = new Route([new Pair(amountIn, amountOut)], inputToken)
        const trade = new Trade(route, amountIn, TradeType.EXACT_INPUT)
        trade.outputAmount = amountOut
        return trade
      } else {
        const trade = Trade.bestTradeExactIn(allowedPairs, amountIn, tokenOut, {
          maxHops: 2,
          maxNumResults: 1
        })

        return (
          trade[0] ?? null
        )
      }
    }
    return null
  }, [
    allowedPairs,
    amountIn,
    tokenOut,
    inputToken,
    outputToken,
    tokenInVet,
    tokenInWvet,
    tokenOutVet,
    tokenOutWvet,
  ])
}

/**
 * Returns the best trade for the token in to the exact amount of token out
 */
export function useTradeExactOut(tokenIn?: Token, amountOut?: TokenAmount): Trade | null {
  const inputToken = tokenIn
  const outputToken = amountOut?.token

  const tokenOutVet = outputToken?.equals(DUMMY_VET[outputToken.chainId])
  const tokenInVet = inputToken?.equals(DUMMY_VET[inputToken.chainId])

  const tokenOutWvet = outputToken?.equals(WVET[outputToken.chainId])
  const tokenInWvet = inputToken?.equals(WVET[inputToken.chainId])

  const allowedPairs = useAllCommonPairs(inputToken, outputToken)

  return useMemo(() => {
    if (tokenIn && amountOut && allowedPairs.length > 0) {
      if (tokenOutVet && !tokenInVet && !tokenInWvet) {
        amountOut.token = WVET[1]
        const trade =
          Trade.bestTradeExactOut(allowedPairs, tokenIn, amountOut, {
            maxHops: 1,
            maxNumResults: 1
          })[0] ?? null
        if (trade) {
          trade.outputAmount.token = DUMMY_VET[inputToken.chainId]
          return trade
        } else {
          return null
        }
      } else if (tokenInVet && !tokenOutWvet && !tokenOutVet) {
        const trade =
          Trade.bestTradeExactOut(allowedPairs, WVET[outputToken.chainId], amountOut, {
            maxHops: 1,
            maxNumResults: 1
          })[0] ?? null
        if (trade) {
          trade.inputAmount.token = DUMMY_VET[outputToken.chainId]
          return trade
        } else {
          return null
        }
      } else if ((tokenInVet && tokenOutWvet) || (tokenInWvet && tokenOutVet)) {
        const amountIn = new TokenAmount(inputToken, amountOut.raw)
        const route = new Route([new Pair(amountIn, amountOut)], inputToken)
        const trade = new Trade(route, amountIn, TradeType.EXACT_INPUT)
        trade.outputAmount = amountOut
        return trade
      } else {
        return (
          Trade.bestTradeExactOut(allowedPairs, tokenIn, amountOut, {
            maxHops: 1,
            maxNumResults: 1
          })[0] ?? null
        )
      }
    }
    return null
  }, [
    allowedPairs,
    tokenIn,
    amountOut,
    inputToken,
    outputToken,
    tokenInVet,
    tokenInWvet,
    tokenOutVet,
    tokenOutWvet,
  ])
}
