# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.10.3](https://github.com/gabeklein/orm/compare/@expressive/orm@0.10.2...@expressive/orm@0.10.3) (2025-09-09)


### Bug Fixes

* await prepare function in update method for proper data handling ([224b1cb](https://github.com/gabeklein/orm/commit/224b1cb1d0d21560efbfe608ae2fbd409644f238))





## [0.10.2](https://github.com/gabeklein/orm/compare/@expressive/orm@0.10.1...@expressive/orm@0.10.2) (2025-09-08)


### Bug Fixes

* add tests for nullable types ([9030c80](https://github.com/gabeklein/orm/commit/9030c80774116b0fc54f72296bac9c8fb5ab76e2))
* update property definition in get function to use Child class ([125e228](https://github.com/gabeklein/orm/commit/125e22891ee5bd41a158967b693a64e269896a5a))





## [0.10.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.10.0...@expressive/orm@0.10.1) (2025-09-08)


### Bug Fixes

* update one() function to accept Config<OneToOneField> for nullable parameter ([643b434](https://github.com/gabeklein/orm/commit/643b4347076a3a4b02b4eb8743b2dfb2c8450a0f))





# [0.10.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.9.1...@expressive/orm@0.10.0) (2025-09-08)


### Bug Fixes

* verify many property ([cf3b908](https://github.com/gabeklein/orm/commit/cf3b9080b8506a31fe4d9a36fc29bf5ad51041b8))


### Features

* implement lazy one() ([e6c7213](https://github.com/gabeklein/orm/commit/e6c72130f0ee100933f134922ec715114337e9f4))
* **orm:** replace config methods with OneToOneField ([a5faf3e](https://github.com/gabeklein/orm/commit/a5faf3e023990920d72df470e00f5497ecadf5c9))
* **tests:** add extended types support and related tests ([0e95e58](https://github.com/gabeklein/orm/commit/0e95e588de74def6ddd8baaacb27511a1d055b40))





## [0.9.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.9.0...@expressive/orm@0.9.1) (2025-09-08)


### Bug Fixes

* **orm:** exclude get types from required fields on new ([ef32aaf](https://github.com/gabeklein/orm/commit/ef32aaf95e4614d9bf1d6130b65b324c2b7555f8))





# [0.9.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.8.0...@expressive/orm@0.9.0) (2025-09-08)


### Bug Fixes

* **orm:** refactor constraint building to support async ([4568abd](https://github.com/gabeklein/orm/commit/4568abd50c2643150730e6fcb365cca069b3d10f))


### Features

* **orm:** handle field proxies in updates ([a315be7](https://github.com/gabeklein/orm/commit/a315be79a0458308fa0227bfd6d0f7adc4ef6ca7))
* **orm:** support type fields in query ([3dad689](https://github.com/gabeklein/orm/commit/3dad68903bcbc7c9d676cb70cdcef6968a0684c5))





# [0.8.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.7.1...@expressive/orm@0.8.0) (2025-09-07)


### Bug Fixes

* **orm:** remove unnecessary second argument from User.new method call in tests ([ae793e6](https://github.com/gabeklein/orm/commit/ae793e67ac4891291ccbaa0b07bcb646728eb092))


### Features

* **orm:** one-fields now support ID, instance and inline create ([9c07aed](https://github.com/gabeklein/orm/commit/9c07aed68a050e600920b5a91882b55b1ff0ebb5))





## [0.7.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.7.0...@expressive/orm@0.7.1) (2025-09-07)


### Bug Fixes

* **orm:** add preversion script ([f84a6d2](https://github.com/gabeklein/orm/commit/f84a6d2ef404d961cec3a3fe6f19c0db2a683f2b))





# [0.7.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.6.0...@expressive/orm@0.7.0) (2025-09-07)


### Bug Fixes

* initialize database connection in reset method ([5734b6a](https://github.com/gabeklein/orm/commit/5734b6aa72f2550ec5e913d646a7152896746a17))
* **orm:** inserts do not break on added methods ([413cbbe](https://github.com/gabeklein/orm/commit/413cbbe1ec6cd9586b0df7bd97d486265c591c64))
* overloads for better type inference ([c60da9b](https://github.com/gabeklein/orm/commit/c60da9b87f7a17917f14cf431f8dd199a73273aa))


### Features

* **orm:** add init method to connection for database initialization ([31c345e](https://github.com/gabeklein/orm/commit/31c345eff4de8fae7f3af03a0440696d7a44d0e9))
* **orm:** implement eager one field ([ee3b1ca](https://github.com/gabeklein/orm/commit/ee3b1ca80e005352c1b123f83c1414a1b33771fe))





# @expressive/orm

## 0.6.0

### Minor Changes

- Added one() instruction, field process is now asyncronous.

## 0.5.3

### Patch Changes

- build

## 0.5.2

### Patch Changes

- bugfix: preprocess where-fields before sending to query

## 0.5.1

### Patch Changes

- build

## 0.5.0

### Minor Changes

- refactored fields, snake_case table and column names

## 0.4.7

### Patch Changes

- bugfix: child types could not be renamed

## 0.4.6

### Patch Changes

- build

## 0.4.5

### Patch Changes

- init orm
