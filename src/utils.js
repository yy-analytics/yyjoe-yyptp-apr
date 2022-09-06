import { Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';

import {
    ANKR_RPC_URL,
    LP_TOKEN_ABI,
    YYJOE_ADDRESS,
    YYJOE_STAKING_ADDRESS,
    JOE_YYJOE_PAIR_ADDRESS,
    BOOSTED_MASTERCHEF_ADDRESS,
    PERCENTAGE_REWARDS_TO_YYJOE,
    YYJOE_STAKING_ABI,
    BOOSTED_MASTERCHEF_ABI,
    YYPTP_ADDRESS,
    YYPTP_STAKING_ADDRESS,
    PTP_YYPTP_PAIR_ADDRESS,
    MASTER_PLATYPUSV3_ADDRESS,
    PERCENTAGE_REWARDS_TO_YYPTP,
    YYPTP_STAKING_ABI,
    MASTER_PLATYPUSV3_ABI,
} from "./constants.js";

// We use this to limit our calls if we are over the allowed rate for the free API.
const delay = (ms = 2000) => new Promise(r => setTimeout(r, ms));

export const convertWithDecimals = (numberString, decimals) => {
    if (decimals && numberString) {
        return Number(numberString.padStart(decimals + 1, '0').replace(RegExp(`(\\d+)(\\d{${decimals}})`), '$1.$2'));
    };
    return undefined;
};

export const getLatestBlockNumber = async (rpcURL = ANKR_RPC_URL) => {
    try {
        const _ = await fetch(rpcURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'eth_blockNumber',
                params: [],
            }),
        });
        const { result } = await _.json();
        return result;
    } catch (e) {
        // Have added the below section because it seems that the RPC url sometimes times out, in which case we need to retry it until we get the data needed.
        if (e["code"] === "ETIMEDOUT" || e["code"] === "ECONNRESET") {
            // console.log('Trying again in 2 seconds...');
            await delay();
            let res = await getLatestBlockNumber(rpcURL);
            return res;
        }
        console.error(`${e["code"]} error - Error calling function eth_blockNumber`);
        console.error(e);
        return undefined;
    }
};

export const callContractFunction = async (abi, contractAddress, contractFunction, functionData = [], defaultBlock = 'latest', rpcURL = ANKR_RPC_URL) => {
    const iface = new Interface(abi);
    try {
        const _ = await fetch(rpcURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [
                    {
                        to: contractAddress,
                        data: iface.encodeFunctionData(contractFunction, functionData),
                    },
                    defaultBlock,
                ],
            }),
        });
        const { result } = await _.json();
        if (result == null) {
            return result;
        }
        const resultDecoded = iface.decodeFunctionResult(contractFunction, result);
        // This part is just for ease of use with the results afterwards.
        if (resultDecoded.length === 1) {
            return resultDecoded[0];
        } else {
            return resultDecoded;
        }
    } catch (e) {
        // Have added the below section because it seems that the RPC url often times out, in which case we need to retry it until we get the data needed.
        if (e["code"] === "ETIMEDOUT" || e["code"] === "ECONNRESET") {
            // console.log('Trying again in 2 seconds...');
            await delay();
            let res = await callContractFunction(abi, contractAddress, contractFunction, functionData, defaultBlock, rpcURL);
            return res;
        }
        console.error(`${e["code"]} error - Error calling function ${contractFunction} for contract ${contractAddress}`);
        return undefined;
    }
};

export const getYyJoeAPR = async () => {
    //
    // Start by finding the latest blockNumber.
    //
    console.log("Getting latest blockNumber...");
    const latestBlock = await getLatestBlockNumber();
    console.log(`Latest block has been retrieved, number = ${BigNumber.from(latestBlock).toNumber()}, hexValue = ${latestBlock}`);
    //
    // Next we need the JoePerSec for boosted pools.
    //
    console.log("Getting the JoePerSec for Boosted MasterChef contract...");
    let joePerSec = await callContractFunction(BOOSTED_MASTERCHEF_ABI, BOOSTED_MASTERCHEF_ADDRESS, 'joePerSec', [], latestBlock);
    joePerSec = convertWithDecimals(BigNumber.from(joePerSec).toString(), 18);
    const joePerYear = joePerSec * 60 * 60 * 24 * 365;
    console.log(`joePerSec = ${joePerSec} JOE`);
    //
    // Then need the totalAllocPoint for BMCJ.
    //
    console.log("Getting the totalAllocPoint for Boosted MasterChef contract...");
    let totalAllocPoint = await callContractFunction(BOOSTED_MASTERCHEF_ABI, BOOSTED_MASTERCHEF_ADDRESS, 'totalAllocPoint', [], latestBlock);
    totalAllocPoint = BigNumber.from(totalAllocPoint).toNumber();
    console.log(`totalAllocPoint = ${totalAllocPoint}`);
    //
    // Now we need the poolLength so that we can call poolInfo and userInfo functions for all pools.
    //
    console.log("Getting the poolLength for Boosted MasterChef contract...");
    let poolLength = await callContractFunction(BOOSTED_MASTERCHEF_ABI, BOOSTED_MASTERCHEF_ADDRESS, 'poolLength', [], latestBlock);
    poolLength = BigNumber.from(poolLength).toNumber();
    console.log(`poolLength = ${poolLength}`);
    //
    // Now we create an array of poolIDs, and query the poolInfo and userInfo data from the boosted masterchef contract.
    // We use this information, and everything else gathered so far to calculate the Joe earned per year.
    //
    const poolIDs = [...Array(poolLength).keys()];
    console.log(`Getting the poolInfo and userInfo for Boosted MasterChef contract for our ${poolLength} pools...`);
    const poolUserInfo = await Promise.all(poolIDs.map(
        async (poolID) => {
            const poolInfo = await callContractFunction(BOOSTED_MASTERCHEF_ABI, BOOSTED_MASTERCHEF_ADDRESS, 'poolInfo', [poolID], latestBlock);
            let { allocPoint, veJoeShareBp, totalFactor, totalLpSupply } = poolInfo;
            allocPoint = BigNumber.from(allocPoint).toNumber();
            totalFactor = convertWithDecimals(BigNumber.from(totalFactor).toString(), 18);
            totalLpSupply = convertWithDecimals(BigNumber.from(totalLpSupply).toString(), 18);
            const userInfo = await callContractFunction(BOOSTED_MASTERCHEF_ABI, BOOSTED_MASTERCHEF_ADDRESS, 'userInfo', [poolID, YYJOE_ADDRESS], latestBlock);
            let { amount, factor } = userInfo;
            amount = convertWithDecimals(BigNumber.from(amount).toString(), 18);
            factor = convertWithDecimals(BigNumber.from(factor).toString(), 18);
            return (
                {
                    poolID,
                    regularJoeEarnedPerYear: allocPoint === 0 ? 0 : joePerYear * allocPoint * (1 - veJoeShareBp / 10000) * amount / (totalAllocPoint * totalLpSupply),
                    boostedJoeEarnedPerYear: allocPoint === 0 ? 0 : joePerYear * allocPoint * (veJoeShareBp / 10000) * factor / (totalAllocPoint * totalFactor),
                }
            )
        }
    ));
    const totalJoeEarnedPerYear = poolUserInfo.reduce((a, b) => a + b.regularJoeEarnedPerYear + b.boostedJoeEarnedPerYear, 0);
    console.log(`Total JOE earned per year = ${totalJoeEarnedPerYear} JOE`);
    //
    // 15% of the Joe earned goes to yyJoe stakers.
    //
    const joeEarnedForYyJoeStakersPerYear = PERCENTAGE_REWARDS_TO_YYJOE * totalJoeEarnedPerYear;
    console.log(`JOE rewards to yyJoe stakers per year = ${joeEarnedForYyJoeStakersPerYear} JOE`);
    //
    // Need the amount of yyJoe that is staked.
    //
    console.log("Getting amount of yyJoe staked...");
    let yyJoeStaked = await callContractFunction(YYJOE_STAKING_ABI, YYJOE_STAKING_ADDRESS, 'internalBalance', [], latestBlock);
    yyJoeStaked = convertWithDecimals(BigNumber.from(yyJoeStaked).toString(), 18);
    console.log(`yyJoe staked = ${yyJoeStaked}`);
    //
    // We also need to current ratio of yyJoe to Joe, from the Trader Joe pool, in order to calculate the relative worth of yyJoe to Joe (for the APR).
    //
    console.log("Getting reserve info for JOE-yyJOE...");
    const reserves = await callContractFunction(LP_TOKEN_ABI, JOE_YYJOE_PAIR_ADDRESS, 'getReserves', [], latestBlock);
    const { _reserve0, _reserve1 } = reserves;
    const reserve0 = convertWithDecimals(BigNumber.from(_reserve0).toString(), 18);
    const reserve1 = convertWithDecimals(BigNumber.from(_reserve1).toString(), 18);
    console.log(`JOE-yyJOE pair currently has ${Number(reserve0).toFixed(2)}... JOE and ${Number(reserve1).toFixed(2)}... yyJOE`);
    //
    // Here we get the ratio of Joe to yyJoe, giving it a maximum value of 1 as can always mint yyJOE at 1:1 ratio.
    //
    const yyJoeRatio = Math.min(1, Number(reserve0) / Number(reserve1));
    console.log(`JOE to yyJOE ratio = ${yyJoeRatio}`);
    const yyJoeStakedInJoe = yyJoeStaked * yyJoeRatio;
    //
    // And finally we can do our APR calculations.
    //
    const yyJoeAPR = joeEarnedForYyJoeStakersPerYear / yyJoeStaked;
    const yyJoeAPRWithDiscount = joeEarnedForYyJoeStakersPerYear / yyJoeStakedInJoe;
    console.log(`\nOverall yyJOE APR (assuming 1:1 ratio) = ${(100 * yyJoeAPR).toFixed(2)}% as of block ${BigNumber.from(latestBlock).toNumber()}`);
    console.log(`\nOverall yyJOE APR (using current JOE:yyJOE ratio) = ${(100 * yyJoeAPRWithDiscount).toFixed(2)}% as of block ${BigNumber.from(latestBlock).toNumber()}`);
    return { yyJoeAPR: `${(100 * yyJoeAPR).toFixed(2)}%`, yyJoeAPRWithDiscount: `${(100 * yyJoeAPRWithDiscount).toFixed(2)}%`, latestBlock: BigNumber.from(latestBlock).toNumber() };
};

export const getYyPTPAPR = async () => {
    //
    // Start by finding the latest blockNumber.
    //
    console.log("Getting latest blockNumber...");
    const latestBlock = await getLatestBlockNumber();
    console.log(`Latest block has been retrieved, number = ${BigNumber.from(latestBlock).toNumber()}, hexValue = ${latestBlock}`);
    //
    // Next we need the ptpPerSec emissions.
    //
    console.log("Getting the ptpPerSec for MasterPlatypusV3 contract...");
    let ptpPerSec = await callContractFunction(MASTER_PLATYPUSV3_ABI, MASTER_PLATYPUSV3_ADDRESS, 'ptpPerSec', [], latestBlock);
    ptpPerSec = convertWithDecimals(BigNumber.from(ptpPerSec).toString(), 18);
    const ptpPerYear = ptpPerSec * 60 * 60 * 24 * 365;
    console.log(`ptpPerSec = ${ptpPerSec} PTP`);
    //
    // Then need the totalAdjustedAllocPoint for the MasterPlatypusV3 contract.
    // The reason we use the adjusted allocation points instead of totalBaseAllocPoint is that the adjusted values
    // take into account the adjustment required to be made to interest rates in order to balance coverage ratios, and
    // THESE are what the PTP rewards are given out on the basis of, not the baseAllocPoint.
    //
    console.log("Getting the totalAdjustedAllocPoint for MasterPlatypusV3 contract...");
    let totalAdjustedAllocPoint = await callContractFunction(MASTER_PLATYPUSV3_ABI, MASTER_PLATYPUSV3_ADDRESS, 'totalAdjustedAllocPoint', [], latestBlock);
    totalAdjustedAllocPoint = convertWithDecimals(BigNumber.from(totalAdjustedAllocPoint).toString(), 18);
    console.log(`totalAdjustedAllocPoint = ${totalAdjustedAllocPoint}`);
    //
    // Now we need the poolLength so that we can call poolInfo and userInfo functions for all pools.
    //
    console.log("Getting the poolLength for MasterPlatypusV3 contract...");
    let poolLength = await callContractFunction(MASTER_PLATYPUSV3_ABI, MASTER_PLATYPUSV3_ADDRESS, 'poolLength', [], latestBlock);
    poolLength = BigNumber.from(poolLength).toNumber();
    console.log(`poolLength = ${poolLength}`);
    //
    // Now we get the dialuting and non-dialuting repartitions, which represent the share of PTP emissions going to "base" rewards
    // and "boosted" rewards respectively, where base rewards are proportional to your deposits, and boosted rewards also depend
    // on your vePTP balance.
    //
    console.log("Getting the dialutingRepartition and nonDialutingRepartition for MasterPlatypusV3 contract...");
    let dialutingRepartition = await callContractFunction(MASTER_PLATYPUSV3_ABI, MASTER_PLATYPUSV3_ADDRESS, 'dialutingRepartition', [], latestBlock);
    dialutingRepartition = BigNumber.from(dialutingRepartition).toNumber();
    let nonDialutingRepartition = await callContractFunction(MASTER_PLATYPUSV3_ABI, MASTER_PLATYPUSV3_ADDRESS, 'nonDialutingRepartition', [], latestBlock);
    nonDialutingRepartition = BigNumber.from(nonDialutingRepartition).toNumber();
    console.log(`dialutingRepartition = ${dialutingRepartition}, nonDialutingRepartition = ${nonDialutingRepartition}`);
    //
    // Now we create an array of poolIDs, and query the poolInfo and userInfo data from the Master Platypus contract.
    // We use this information, and everything else gathered so far to calculate the PTP earned per year.
    //
    const poolIDs = [...Array(poolLength).keys()];
    console.log(`Getting the poolInfo and userInfo for MasterPlatypusV3 contract for our ${poolLength} pools...`);
    const poolUserInfo = await Promise.all(poolIDs.map(
        async (poolID) => {
            const poolInfo = await callContractFunction(MASTER_PLATYPUSV3_ABI, MASTER_PLATYPUSV3_ADDRESS, 'poolInfo', [poolID], latestBlock);
            let { lpToken, adjustedAllocPoint, sumOfFactors } = poolInfo;
            adjustedAllocPoint = convertWithDecimals(BigNumber.from(adjustedAllocPoint).toString(), 18);
            // Platypus LP token is 6 decimals and vePTP is 18 => sqrt of the multiplied combo is 12 decimals.
            sumOfFactors = convertWithDecimals(BigNumber.from(sumOfFactors).toString(), 12);
            let totalLpSupply = await callContractFunction(LP_TOKEN_ABI, lpToken, 'balanceOf', [MASTER_PLATYPUSV3_ADDRESS], latestBlock);
            // Platypus LP tokens have 6 decimals.
            totalLpSupply = convertWithDecimals(BigNumber.from(totalLpSupply).toString(), 6);
            const userInfo = await callContractFunction(MASTER_PLATYPUSV3_ABI, MASTER_PLATYPUSV3_ADDRESS, 'userInfo', [poolID, YYPTP_ADDRESS], latestBlock);
            let { amount, factor } = userInfo;
            amount = convertWithDecimals(BigNumber.from(amount).toString(), 6);
            factor = convertWithDecimals(BigNumber.from(factor).toString(), 12);
            return (
                {
                    poolID,
                    basePTPEarnedPerYear: adjustedAllocPoint === 0 ? 0 : ptpPerYear * adjustedAllocPoint * (dialutingRepartition / 1000) * amount / (totalAdjustedAllocPoint * totalLpSupply),
                    boostedPTPEarnedPerYear: adjustedAllocPoint === 0 ? 0 : ptpPerYear * adjustedAllocPoint * (nonDialutingRepartition / 1000) * factor / (totalAdjustedAllocPoint * sumOfFactors),
                }
            )
        }
        ));
    const totalPTPEarnedPerYear = poolUserInfo.reduce((a, b) => a + b.basePTPEarnedPerYear + b.boostedPTPEarnedPerYear, 0);
    console.log(`Total PTP earned per year = ${totalPTPEarnedPerYear} PTP`);
    //
    // 15% of the PTP earned goes to yyPTP stakers.
    //
    const ptpEarnedForYyPtpStakersPerYear = PERCENTAGE_REWARDS_TO_YYPTP * totalPTPEarnedPerYear;
    console.log(`PTP rewards to yyPTP stakers per year = ${ptpEarnedForYyPtpStakersPerYear} PTP`);
    //
    // Need the amount of yyPTP that is staked.
    //
    console.log("Getting amount of yyPTP staked...");
    let yyPTPStaked = await callContractFunction(YYPTP_STAKING_ABI, YYPTP_STAKING_ADDRESS, 'internalBalance', [], latestBlock);
    yyPTPStaked = convertWithDecimals(BigNumber.from(yyPTPStaked).toString(), 18);
    console.log(`yyPTP staked = ${yyPTPStaked}`);
    //
    // We also need to current ratio of yyPTP to PTP, from the Pangolin pool, in order to calculate the relative worth of yyPTP to PTP (for the APR).
    //
    console.log("Getting reserve info for PTP-yyPTP...");
    const reserves = await callContractFunction(LP_TOKEN_ABI, PTP_YYPTP_PAIR_ADDRESS, 'getReserves', [], latestBlock);
    const { _reserve0, _reserve1 } = reserves;
    const reserve0 = convertWithDecimals(BigNumber.from(_reserve0).toString(), 18);
    const reserve1 = convertWithDecimals(BigNumber.from(_reserve1).toString(), 18);
    console.log(`PTP-yyPTP pair currently has ${Number(reserve0).toFixed(2)}... PTP and ${Number(reserve1).toFixed(2)}... yyPTP`);
    //
    // Here we get the ratio of PTP to yyPTP, giving it a maximum value of 1 as can always mint yyPTP at 1:1 ratio.
    //
    const yyPTPRatio = Math.min(1, Number(reserve0) / Number(reserve1));
    console.log(`PTP to yyPTP ratio = ${yyPTPRatio}`);
    const yyPTPStakedInPTP = yyPTPStaked * yyPTPRatio;
    //
    // And finally we can do our APR calculations.
    //
    const yyPTPAPR = ptpEarnedForYyPtpStakersPerYear / yyPTPStaked;
    const yyPTPAPRWithDiscount = ptpEarnedForYyPtpStakersPerYear / yyPTPStakedInPTP;
    console.log(`\nOverall yyPTP APR (assuming 1:1 ratio) = ${(100 * yyPTPAPR).toFixed(2)}% as of block ${BigNumber.from(latestBlock).toNumber()}`);
    console.log(`\nOverall yyPTP APR (using current PTP:yyPTP ratio) = ${(100 * yyPTPAPRWithDiscount).toFixed(2)}% as of block ${BigNumber.from(latestBlock).toNumber()}`);
    return { yyPTPAPR: `${(100 * yyPTPAPR).toFixed(2)}%`, yyPTPAPRWithDiscount: `${(100 * yyPTPAPRWithDiscount).toFixed(2)}%`, latestBlock: BigNumber.from(latestBlock).toNumber() };
};