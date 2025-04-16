# Meteora Virtual Bonding Curve SDK

A Typescript SDK for interacting with the Virtual Bonding Curve on Meteora.

## Overview

This SDK provides a set of tools and methods to interact with the [Meteora Virtual Bonding Curve](https://github.com/MeteoraAg/virtual-curve). It enables developers to easily create and manage virtual bonding curves, with support for custom configurations and fee structures.

## Installation

```bash
pnpm install @meteora-ag/virtual-curve-sdk
# or
yarn add @meteora-ag/virtual-curve-sdk
```

## Initialization

```bash
import { Connection } from "@solana/web3.js";
import { VirtualCurveClient } from "@meteora-ag/virtual-curve-sdk";

const connection = new Connection('https://api.mainnet-beta.solana.com')
const client = new VirtualCurveClient(connection)
```

### Test

```bash
bun install
bun test
```
