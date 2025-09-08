# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
