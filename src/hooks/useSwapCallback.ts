import { BigNumber } from '@ethersproject/bignumber'
import { Token, Trade, TradeType, WVET } from 'vexchange-sdk'
import { useMemo } from 'react'
import { find } from 'lodash'
import { DEFAULT_DEADLINE_FROM_NOW, DUMMY_VET, INITIAL_ALLOWED_SLIPPAGE, ROUTER_ADDRESS } from '../constants'
import { abi as IVexchangeV2Router02ABI } from '../constants/abis/IVexchangeV2Router02.json'
import { abi as WVETABI } from '../constants/abis/WVET.json'
import { useTokenAllowance } from '../data/Allowances'
import { Field } from '../state/swap/actions'
import { useTransactionAdder } from '../state/transactions/hooks'
import { computeSlippageAdjustedAmounts } from '../utils/prices'
import { isAddress } from '../utils'
import { useWeb3React } from './index'
import { IFreeSwapInfo } from '../pages/Swap'

enum SwapType {
  EXACT_TOKENS_FOR_TOKENS,
  EXACT_TOKENS_FOR_VET,
  EXACT_VET_FOR_TOKENS,
  TOKENS_FOR_EXACT_TOKENS,
  TOKENS_FOR_EXACT_VET,
  VET_FOR_EXACT_TOKENS,
  WRAP_VET,
  UNWRAP_WVET
}

function getSwapType(tokens: { [field in Field]?: Token }, isExactIn: boolean, chainId: number): SwapType {
  if (isExactIn) {
    if (tokens[Field.INPUT]?.equals(DUMMY_VET[chainId])) {
      if (tokens[Field.OUTPUT]?.equals(WVET[chainId])) {
        return SwapType.WRAP_VET
      } else {
        return SwapType.EXACT_VET_FOR_TOKENS
      }
    } else if (tokens[Field.OUTPUT]?.equals(DUMMY_VET[chainId])) {
      if (tokens[Field.INPUT]?.equals(WVET[chainId])) {
        return SwapType.UNWRAP_WVET
      } else {
        return SwapType.EXACT_TOKENS_FOR_VET
      }
    } else {
      return SwapType.EXACT_TOKENS_FOR_TOKENS
    }
  } else {
    if (tokens[Field.INPUT]?.equals(DUMMY_VET[chainId])) {
      if (tokens[Field.OUTPUT]?.equals(WVET[chainId])) {
        return SwapType.WRAP_VET
      } else {
        return SwapType.VET_FOR_EXACT_TOKENS
      }
    } else if (tokens[Field.OUTPUT]?.equals(DUMMY_VET[chainId])) {
      if (tokens[Field.INPUT]?.equals(WVET[chainId])) {
        return SwapType.UNWRAP_WVET
      } else {
        return SwapType.TOKENS_FOR_EXACT_VET
      }
    } else {
      return SwapType.TOKENS_FOR_EXACT_TOKENS
    }
  }
}

// returns a function that will execute a swap, if the parameters are all valid
// and the user has approved the slippage adjusted input amount for the trade
export function useSwapCallback(
  trade?: Trade, // trade to execute, required
  allowedSlippage: number = INITIAL_ALLOWED_SLIPPAGE, // in bips, optional
  deadline: number = DEFAULT_DEADLINE_FROM_NOW, // in seconds from now, optional
  to?: string, // recipient of output, optional
  userFreeSwapInfo?: IFreeSwapInfo
): null | (() => Promise<string>) {
  const { account, chainId, library } = useWeb3React()
  const inputAllowance = useTokenAllowance(trade?.inputAmount?.token, account, ROUTER_ADDRESS)
  const addTransaction = useTransactionAdder()
  const recipient = to ? isAddress(to) : account

  return useMemo(() => {
    if (!trade) return null
    if (!recipient) return null

    // will always be defined
    const slippageAdjustedAmounts = computeSlippageAdjustedAmounts(trade, allowedSlippage)

    const isUnwrap =
      trade.inputAmount.token.equals(WVET[chainId]) && trade.outputAmount.token.equals(DUMMY_VET[chainId])

    // no allowance
    if (
      !trade.inputAmount.token.equals(DUMMY_VET[chainId]) &&
      (!inputAllowance || slippageAdjustedAmounts[Field.INPUT].greaterThan(inputAllowance)) &&
      !isUnwrap
    ) {
      return null
    }

    return async function onSwap() {
      const path = trade.route.path.map(t => t.address)

      const deadlineFromNow: number = Math.ceil(Date.now() / 1000) + deadline

      const swapType = getSwapType(
        { [Field.INPUT]: trade.inputAmount.token, [Field.OUTPUT]: trade.outputAmount.token },
        trade.tradeType === TradeType.EXACT_INPUT,
        chainId
      )

      let args, value, abi

      switch (swapType) {
        case SwapType.EXACT_TOKENS_FOR_TOKENS:
          abi = find(IVexchangeV2Router02ABI, { name: 'swapExactTokensForTokens' })

          args = [
            slippageAdjustedAmounts[Field.INPUT].raw.toString(),
            slippageAdjustedAmounts[Field.OUTPUT].raw.toString(),
            path,
            recipient,
            deadlineFromNow
          ]
          value = null
          break
        case SwapType.TOKENS_FOR_EXACT_TOKENS:
          abi = find(IVexchangeV2Router02ABI, { name: 'swapTokensForExactTokens' })

          args = [
            slippageAdjustedAmounts[Field.OUTPUT].raw.toString(),
            slippageAdjustedAmounts[Field.INPUT].raw.toString(),
            path,
            recipient,
            deadlineFromNow
          ]
          value = null
          break
        case SwapType.EXACT_VET_FOR_TOKENS:
          abi = find(IVexchangeV2Router02ABI, { name: 'swapExactVETForTokens' })

          args = [slippageAdjustedAmounts[Field.OUTPUT].raw.toString(), path, recipient, deadlineFromNow]
          value = BigNumber.from(slippageAdjustedAmounts[Field.INPUT].raw.toString())
          break
        case SwapType.TOKENS_FOR_EXACT_VET:
          abi = find(IVexchangeV2Router02ABI, { name: 'swapTokensForExactVET' })

          args = [
            slippageAdjustedAmounts[Field.OUTPUT].raw.toString(),
            slippageAdjustedAmounts[Field.INPUT].raw.toString(),
            path,
            recipient,
            deadlineFromNow
          ]
          value = null
          break
        case SwapType.EXACT_TOKENS_FOR_VET:
          abi = find(IVexchangeV2Router02ABI, { name: 'swapExactTokensForVET' })

          args = [
            slippageAdjustedAmounts[Field.INPUT].raw.toString(),
            slippageAdjustedAmounts[Field.OUTPUT].raw.toString(),
            path,
            recipient,
            deadlineFromNow
          ]
          value = null
          break
        case SwapType.VET_FOR_EXACT_TOKENS:
          abi = find(IVexchangeV2Router02ABI, { name: 'swapVETForExactTokens' })

          args = [slippageAdjustedAmounts[Field.OUTPUT].raw.toString(), path, recipient, deadlineFromNow]
          value = BigNumber.from(slippageAdjustedAmounts[Field.INPUT].raw.toString())
          break
        case SwapType.WRAP_VET:
          args = []
          abi = find(WVETABI, { name: 'deposit' })
          value = BigNumber.from(slippageAdjustedAmounts[Field.INPUT].raw.toString())
          break
        case SwapType.UNWRAP_WVET:
          args = [slippageAdjustedAmounts[Field.INPUT].raw.toString()]
          abi = find(WVETABI, { name: 'withdraw' })
          value = null
          break
      }

      const contractAddress =
        swapType === SwapType.UNWRAP_WVET || swapType === SwapType.WRAP_VET ? WVET[chainId].address : ROUTER_ADDRESS
      let comment = `Swap ${trade.inputAmount.token.symbol} for ${trade.outputAmount.token.symbol}`
      const isEligibleForFreeSwap = userFreeSwapInfo?.remainingFreeSwaps > 0 && userFreeSwapInfo?.hasNFT
      const isConnex1 = !!window.connex
      const connex = isConnex1 ? window.connex : library
      // eslint-disable-next-line
      let tx, request, delegateParam
      let method = connex.thor.account(contractAddress).method(abi)
      let clause = method.asClause(...args)

      if (swapType === SwapType.UNWRAP_WVET) {
        comment = 'Unwrap WVET into VET'
      } else if (swapType === SwapType.WRAP_VET) {
        comment = 'Wrap VET into WVET'
      }

      if (isConnex1) {
        tx = connex.vendor.sign('tx').comment(comment)
        delegateParam = (res: any) => {
          return new Promise(resolve => {
            fetch(`${process.env.REACT_APP_VIP191_API_URL}`, {
              method: 'POST',
              headers: {
                Accept: 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(res)
            })
              .then(response => response.json())
              .then(data => {
                resolve(data)
              })
          })
        }
      } else {
        tx = connex.vendor
          .sign('tx', [
            {
              ...clause,
              value: value ? value.toString() : 0
            }
          ])
          .comment(comment)
        delegateParam = process.env.REACT_APP_VIP191_API_URL
      }

      if (isEligibleForFreeSwap) {
        await tx.delegate(delegateParam)
      }

      request = isConnex1 ? tx.request([clause]) : tx.request()

      if (userFreeSwapInfo && userFreeSwapInfo.remainingFreeSwaps > 0) {
        tx.delegate(process.env.REACT_APP_VIP191_API_URL)
      }

      return tx
        .request()
        .then(response => {
          if (recipient === account) {
            addTransaction(response, {
              summary: comment
            })
          } else {
            addTransaction(response, {
              summary: comment + ' to ' + recipient
            })
          }

          return response.txid
        })
        .catch(error => {
          console.error(`Swap or gas estimate failed`, error)
        })
    }
  }, [
    account,
    allowedSlippage,
    addTransaction,
    chainId,
    deadline,
    inputAllowance,
    library,
    trade,
    recipient,
    userFreeSwapInfo
  ])
}
