import { v1 as uuid } from 'uuid';

const express = require('express');
const rp = require('request-promise');

const blockchainRoutes = express.Router();
const blockchain = require('../../blockchain/blockchain');

const ipseicoin = new (blockchain as any)();
const nodeAddress = uuid().split('-').join('');

blockchainRoutes
  .get('/', (req: any, res: any) => {
    res.send(ipseicoin);
  })
  .get('/mine', (req:any, res:any) => {
    const lastBlock = ipseicoin.getLastBlock();
    const previousBlockHash = lastBlock.hash;
    const currentBlock = {
      transactions: ipseicoin.pendingTransactions,
      index: lastBlock.index + 1,
    };
    const nonce = ipseicoin.proofOfWork(previousBlockHash, currentBlock);
    const blockHash = ipseicoin.hashBlock(previousBlockHash, currentBlock, nonce);
    ipseicoin.createNewTransaction(12.5, '00', nodeAddress);
    const newBlock = ipseicoin.createNewBlock(nonce, previousBlockHash, blockHash);

    const requestsPromises: Array<Promise<any>> = [];
    ipseicoin.networkNodes.forEach((networkNodeUrl: any) => {
      const requestOptions = {
        uri: `${networkNodeUrl}/blockchain/receive-new-block`,
        method: 'POST',
        body: { newBlock },
        json: true,
      };
      requestsPromises.push(rp(requestOptions));
    });

    Promise.all(requestsPromises).then(() => {
      const requestOptions = {
        uri: `${ipseicoin.currentNode}/blockchain/transaction/broadcast`,
        method: 'POST',
        body: { amount: 345, sender: '00', recipient: nodeAddress },
        json: true,
      };
      return rp(requestOptions);
    }).then(() => {
      res.json({
        note: 'New block created & broadcast successfully', newBlock,
      });
    })
      .catch((err) => {
        console.log(err);
      });
  })
  .post('/receive-new-block', (req: any, res: any) => {
    const { newBlock } = req.body;
    const lastBlock = ipseicoin.getLastBlock();
    const isHashCorrect = lastBlock.hash === newBlock.previousBlockHash;
    const isIndexCorrect = lastBlock.index + 1 === newBlock.index;
    if (isHashCorrect && isIndexCorrect) {
      ipseicoin.chain.push(newBlock);
      ipseicoin.pendingTransactions = [];
      res.json({ note: 'newBlock received && pendingTransactions empty', newBlock });
    } else {
      res.json({ note: 'newBlock rejected && corrupted', newBlock });
    }
  })
  .post('/transaction', (req: any, res: any) => {
    const blockIndex = ipseicoin.addTransactionToPendingTransactions(req.body);
    res.json({ note: `Transaction will be added in block ${blockIndex}` });
  })
  .post('/transaction/broadcast', (req: any, res: any) => {
    const newTransaction = ipseicoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    ipseicoin.addTransactionToPendingTransactions(newTransaction);
    const requestsPromises: Array<Promise<any>> = [];
    ipseicoin.networkNodes.forEach((networkNodeUrl: any) => {
      const requestOptions = {
        uri: `${networkNodeUrl}/blockchain/transaction`,
        method: 'POST',
        body: { ...newTransaction },
        json: true,
      };
      requestsPromises.push(rp(requestOptions));
    });
    Promise.all(requestsPromises).then(() => {
      res.json({ note: 'Broadcast successfully' });
    }).catch((err) => {
      console.error(err);
      res.json({ note: 'Error', err });
    });
  })
  .post('/broadcast-node', (req: any, res: any) => {
    const { newNodeUrl } = req.body;
    if (ipseicoin.networkNodes.indexOf(newNodeUrl) === -1) ipseicoin.networkNodes.push(newNodeUrl);
    const registerNodesPromises: Array<Promise<any>> = [];
    ipseicoin.networkNodes.forEach((networkNodeUrl: string) => {
      const requestOptions = {
        uri: `${networkNodeUrl}/blockchain/register-node`,
        method: 'POST',
        body: { newNodeUrl },
        json: true,
      };
      registerNodesPromises.push(rp(requestOptions));
    });
    Promise.all(registerNodesPromises).then(() => {
      const requestOptions = {
        uri: `${newNodeUrl}/blockchain/register-nodes-bulk`,
        method: 'POST',
        body: { allNetworkNodes: [...ipseicoin.networkNodes, ipseicoin.currentNode] },
        json: true,
      };
      return rp(requestOptions);
    }).then(() => {
      res.json({ note: 'NEW NODE CREATED' });
    })
      .catch((err) => {
        res.json({ note: 'ERROR WHILE NEW NODE CREATED', err });
      });
  })
  .post('/register-node', (req: any, res: any) => {
    const { newNodeUrl } = req.body;
    const alreadyRegistered = ipseicoin.networkNodes.indexOf(newNodeUrl) === -1;
    const isCurrentNode = ipseicoin.currentNode !== newNodeUrl;
    if (alreadyRegistered && isCurrentNode) ipseicoin.networkNodes.push(newNodeUrl);
    res.json({ note: 'NEW NODE REGISTERED' });
  })
  .post('/register-nodes-bulk', (req: any, res: any) => {
    const { allNetworkNodes } = req.body;
    allNetworkNodes.forEach((networkNodeUrl: any) => {
      const nodeNotAlreadyExist = ipseicoin.networkNodes.indexOf(networkNodeUrl) === -1;
      const notCurrentNode = ipseicoin.currentNode !== networkNodeUrl;
      if (nodeNotAlreadyExist && notCurrentNode) ipseicoin.networkNodes.push(networkNodeUrl);
    });
    res.json({ note: 'ALL NODES REGISTERED' });
  });

module.exports = blockchainRoutes;
