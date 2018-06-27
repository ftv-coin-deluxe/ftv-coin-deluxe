# FTV Coin Deluxe - Source code

#desired versions:
Truffle v3.4.5 (core: 3.4.5)
Solidity v0.4.11 (solc-js)  #is a dependency of truffle 3.4.5

#Run Tests:

    sudo npm install -g truffle@3.4.5
    sudo npm install -g ganache-cli
    npm install .
    truffle install zeppelin

start ganache-cli with

    ./scripts/start_ganache.sh

run tests with

    truffle test
