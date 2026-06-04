# Changelog

## [1.1.21](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.20...v1.1.21) (2026-06-04)


### ⚠ BREAKING CHANGES

* marketplace install URLs change. Claude Code users should add XYOracleNetwork/xyo-claude-plugin; Codex users should add XYOracleNetwork/xyo-codex-plugin. Skills.sh URL is unchanged.

### Features

* split distribution into Claude/Codex mirror repos ([00ae679](https://github.com/XYOracleNetwork/xyo-skills/commit/00ae6799f3c9d7bc0234de49e7c6814b613f4d5f))

## [1.1.20](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.19...v1.1.20) (2026-06-03)


### Features

* add Codex marketplace support ([3745175](https://github.com/XYOracleNetwork/xyo-skills/commit/374517581a410debc4d74727c929ce7355ce6e26))
* add Codex plugin support ([7b5e883](https://github.com/XYOracleNetwork/xyo-skills/commit/7b5e8837656e59908bc78d8ca5ab66a3aa354d9e))
* add Codex plugin support, xl1-build wizard, and schema namespace guidance ([4b6df23](https://github.com/XYOracleNetwork/xyo-skills/commit/4b6df23a5c692843a65071877d187740e2afa92d))
* add Layer 3 acceptance criteria to the agent completion gate ([a42dae5](https://github.com/XYOracleNetwork/xyo-skills/commit/a42dae5a5efb5e5c8d7878bc2c54c5f1419cc19c))
* add Layer 3 acceptance criteria to the agent completion gate ([d349ac0](https://github.com/XYOracleNetwork/xyo-skills/commit/d349ac084d9e2aa8c5e43739eb76ec0a24e81c42))
* add xl1-build planning wizard skill ([a7ba3d8](https://github.com/XYOracleNetwork/xyo-skills/commit/a7ba3d83fa5808cf0c26db17f3dbdb0da5ba730a))
* add xl1-build planning wizard skill ([339ad18](https://github.com/XYOracleNetwork/xyo-skills/commit/339ad18dd2c1c95daf1f1ba33f40b149d692b8a9))
* add XYO brand icon/logo to Codex plugin and set Developer Tools category ([50f42a5](https://github.com/XYOracleNetwork/xyo-skills/commit/50f42a581c1864f2c85f74ebf4c249f9aa974449))
* reserve network.xyo.* and steer app schemas to com.example.* ([37a1ea9](https://github.com/XYOracleNetwork/xyo-skills/commit/37a1ea9e7da4d7460f2011d5e7358fe0707655e6))
* reserve network.xyo.* and steer app schemas to com.example.* ([4380639](https://github.com/XYOracleNetwork/xyo-skills/commit/4380639ef14350f6d42349804980b6354bd50c08))
* surface skill versions and persist xl1-build PRD ([a60dfbf](https://github.com/XYOracleNetwork/xyo-skills/commit/a60dfbf9154b6c506514ab203eab6a6eb9b5d885))
* surface skill versions and persist xl1-build PRD ([4f02d95](https://github.com/XYOracleNetwork/xyo-skills/commit/4f02d9535cf9c9d02c23b671c1dbe1288fe2cd00))


### Bug Fixes

* bump brace-expansion to 5.0.6 to clear Dependabot alert ([8e1e999](https://github.com/XYOracleNetwork/xyo-skills/commit/8e1e99954946bc2db1329048d93d574ac3e46ab3))
* expand truncated anchor links to chain-data-indexing-protocol ([2cfb1d2](https://github.com/XYOracleNetwork/xyo-skills/commit/2cfb1d2cca2990a7bdfcafe5ec33fc5ed7872060))
* move Codex marketplace to canonical .agents/plugins/ path ([9a5b28f](https://github.com/XYOracleNetwork/xyo-skills/commit/9a5b28f37cca11c123b0ddea4870a231ff46d1a1))

## [1.1.19](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.18...v1.1.19) (2026-05-27)


### Bug Fixes

* vendor-neutral skill descriptions and refreshed install docs ([dcc6723](https://github.com/XYOracleNetwork/xyo-skills/commit/dcc6723d95f5bf2fd3f8d6cbf1fae0813b7de327))

## [1.1.18](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.17...v1.1.18) (2026-05-27)


### Features

* add wallet skill and RPC guidance ([eccbc9f](https://github.com/XYOracleNetwork/xyo-skills/commit/eccbc9fc502bbfaa563f14102d3d75f3d6b0b696))
* add wallet skill page with permissions section ([8d7c8cd](https://github.com/XYOracleNetwork/xyo-skills/commit/8d7c8cdf28cbe55c8a0e215aac2af7e499034960))
* add wallet skill page with permissions section ([20550d6](https://github.com/XYOracleNetwork/xyo-skills/commit/20550d6ba2f16eac94fce48f41da06f95f1e24ac))

## [1.1.17](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.16...v1.1.17) (2026-05-27)


### Bug Fixes

* stop shipping audit-imports housekeeping skill + install-docs clarification ([96305d0](https://github.com/XYOracleNetwork/xyo-skills/commit/96305d0de6bda2228d1c13a59de7ae8bb33eac2d))

## [1.1.16](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.15...v1.1.16) (2026-05-27)


### Bug Fixes

* **ci:** integrate post-release sync workflow fixes ([54dd1c5](https://github.com/XYOracleNetwork/xyo-skills/commit/54dd1c59de45e9ccf632f202efed759ef9ac0393))
* **ci:** use RELEASE_PLEASE_TOKEN for post-release sync and fail loudly on missing PR ([#8](https://github.com/XYOracleNetwork/xyo-skills/issues/8)) ([05991ec](https://github.com/XYOracleNetwork/xyo-skills/commit/05991ec59f8bf4be9968844e73f2cfe22b2acdf5))

## [1.1.15](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.14...v1.1.15) (2026-05-26)


### ⚠ BREAKING CHANGES

* rename plugin to xyo-skills + multi-platform install docs ([#4](https://github.com/XYOracleNetwork/xyo-skills/issues/4))

### Features

* rename plugin to xyo-skills + multi-platform install docs ([#4](https://github.com/XYOracleNetwork/xyo-skills/issues/4)) ([0081693](https://github.com/XYOracleNetwork/xyo-skills/commit/008169303dbc767d3236f18bfd5cd6e75bb9c212))
* ship xyo-skills rename + xl1-react-client-sdk migration ([8293984](https://github.com/XYOracleNetwork/xyo-skills/commit/829398417ec6dee180d79e1d8ce89847272abf69))


### Bug Fixes

* migrate scaffold + docs to @xyo-network/xl1-react-client-sdk ([1fe77cf](https://github.com/XYOracleNetwork/xyo-skills/commit/1fe77cf7796c9b20e3e05a9eec78ec57f2fd8686))
* migrate scaffold + docs to @xyo-network/xl1-react-client-sdk ([e1777e2](https://github.com/XYOracleNetwork/xyo-skills/commit/e1777e2f867fc3ef3545e76656a522689de7e049))

## [1.1.14](https://github.com/XYOracleNetwork/xyo-skills/compare/v1.1.13...v1.1.14) (2026-05-23)


### Features

* migrate to xyo-skills as the canonical repo ([d111241](https://github.com/XYOracleNetwork/xyo-skills/commit/d111241b87a82733519632d1711ea423761d857b))

## [1.1.13](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.12...v1.1.13) (2026-05-23)


### Features

* flatten plugin layout to repo root for Marketplace compatibility ([#80](https://github.com/XYOracleNetwork/xl1-skills/issues/80)) ([a151edf](https://github.com/XYOracleNetwork/xl1-skills/commit/a151edfb040e65ce276e4f69d5da337842ea0f3f))

## [1.1.12](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.11...v1.1.12) (2026-05-14)


### Bug Fixes

* correct license metadata to LGPL-3.0 ([#75](https://github.com/XYOracleNetwork/xl1-skills/issues/75)) ([6004338](https://github.com/XYOracleNetwork/xl1-skills/commit/6004338896cd5bab2d2cac6d9ed2c264256bb0cd))
* correct license metadata to LGPL-3.0 and split README ([#76](https://github.com/XYOracleNetwork/xl1-skills/issues/76)) ([cbfc0b3](https://github.com/XYOracleNetwork/xl1-skills/commit/cbfc0b3e3faa18cc14454b48c629937833daf0d6))

## [1.1.11](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.10...v1.1.11) (2026-05-12)


### Features

* add multi-source skills sync to xyo-skills mirror ([#70](https://github.com/XYOracleNetwork/xl1-skills/issues/70)) ([bc504a2](https://github.com/XYOracleNetwork/xl1-skills/commit/bc504a29ee268b743266466ac26f9730c272fe90))
* release multi-source skills sync to xyo-skills ([#71](https://github.com/XYOracleNetwork/xl1-skills/issues/71)) ([25946f6](https://github.com/XYOracleNetwork/xl1-skills/commit/25946f67ef502ede82569b95dec68b7321ff12d4))

## [1.1.10](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.9...v1.1.10) (2026-05-07)


### Features

* release block hydration semantics + indexer round-trip DoD ([#65](https://github.com/XYOracleNetwork/xl1-skills/issues/65)) ([a9c57a4](https://github.com/XYOracleNetwork/xl1-skills/commit/a9c57a4027805d6a9a22fb682b4ac6e06c24203d))
* **skills:** block hydration semantics + mandatory indexer round-trip ([#64](https://github.com/XYOracleNetwork/xl1-skills/issues/64)) ([83829ef](https://github.com/XYOracleNetwork/xl1-skills/commit/83829ef831411d6437e4d20b3a35bf9b6c4d9c8b))
* **skills:** make indexer service round-trip mandatory in dApp DoD ([9f6e246](https://github.com/XYOracleNetwork/xl1-skills/commit/9f6e246ab334a96cb671a8ce00a9267463467347))

## [1.1.9](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.8...v1.1.9) (2026-05-06)


### Features

* release dApp DoD mandatory hand-off step ([#61](https://github.com/XYOracleNetwork/xl1-skills/issues/61)) ([c205c96](https://github.com/XYOracleNetwork/xl1-skills/commit/c205c968a44ca2e36e5c5d7f4d3a9dc74bcf34a3))
* **skills:** make dApp DoD a mandatory hand-off step ([#60](https://github.com/XYOracleNetwork/xl1-skills/issues/60)) ([b89e6ab](https://github.com/XYOracleNetwork/xl1-skills/commit/b89e6ab550a8c5fb98e8705511254bd6c3924183))

## [1.1.8](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.7...v1.1.8) (2026-05-06)


### Features

* release Floor Block indexing pattern and headless verification checklist ([#56](https://github.com/XYOracleNetwork/xl1-skills/issues/56)) ([b52d84a](https://github.com/XYOracleNetwork/xl1-skills/commit/b52d84a75dd4a313c403e9e68ea6a72d1a63f7c9))
* **skills:** Floor Block indexing pattern + headless verification checklist ([#55](https://github.com/XYOracleNetwork/xl1-skills/issues/55)) ([befcce5](https://github.com/XYOracleNetwork/xl1-skills/commit/befcce59bd32f04173914be6710b5f309021e59c))

## [1.1.7](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.6...v1.1.7) (2026-05-05)


### Features

* release GatewayBuilder + headless dApp verification ([#52](https://github.com/XYOracleNetwork/xl1-skills/issues/52)) ([64fed1a](https://github.com/XYOracleNetwork/xl1-skills/commit/64fed1a47ee086b759490ef14a68d257cc945f81))

## [1.1.6](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.5...v1.1.6) (2026-05-01)


### Features

* add LGPL license ([#48](https://github.com/XYOracleNetwork/xl1-skills/issues/48)) ([8b3bd20](https://github.com/XYOracleNetwork/xl1-skills/commit/8b3bd20e0821398a125475c5077feeceed47966a))

## [1.1.5](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.4...v1.1.5) (2026-05-01)


### Features

* refine XL1 dev skills for env, identity, and UX ([#45](https://github.com/XYOracleNetwork/xl1-skills/issues/45)) ([9689703](https://github.com/XYOracleNetwork/xl1-skills/commit/96897033c6a8ddba953bd8488d17399be3add0ba))

## [1.1.4](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.3...v1.1.4) (2026-04-29)


### Bug Fixes

* auto-merge sync PR with merge-commit method ([#39](https://github.com/XYOracleNetwork/xl1-skills/issues/39)) ([ca568b4](https://github.com/XYOracleNetwork/xl1-skills/commit/ca568b4ec0b3eaa59252173168eb8ebf87887e94))

## [1.1.3](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.2...v1.1.3) (2026-04-29)


### Bug Fixes

* skip PR-title lint for release-please branches ([#35](https://github.com/XYOracleNetwork/xl1-skills/issues/35)) ([5176d86](https://github.com/XYOracleNetwork/xl1-skills/commit/5176d869afa4cf9c3e8955e44324e0c273d1749f))
* use PAT for release-please so its PRs trigger checks ([#37](https://github.com/XYOracleNetwork/xl1-skills/issues/37)) ([8f65bf1](https://github.com/XYOracleNetwork/xl1-skills/commit/8f65bf172292c64c13bcfbd792343ca63977ea71))

## [1.1.2](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.1...v1.1.2) (2026-04-29)


### Bug Fixes

* require conventional title on PRs to main ([#33](https://github.com/XYOracleNetwork/xl1-skills/issues/33)) ([7f0a1fc](https://github.com/XYOracleNetwork/xl1-skills/commit/7f0a1fcf8bdaddf08cc8a5c8ae01c83aeb0bfcc2))

## [1.1.1](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.1.0...v1.1.1) (2026-04-28)


### Bug Fixes

* **ci:** pin release-please target-branch to main ([821fc0c](https://github.com/XYOracleNetwork/xl1-skills/commit/821fc0c428eab824ae973d52f6abc7812f5591ff))
* **ci:** pin release-please target-branch to main, anchor at v1.1.0 ([ecdc03e](https://github.com/XYOracleNetwork/xl1-skills/commit/ecdc03e7188cfd8f4ac135e536ef902880fce0ea))

## [1.1.0](https://github.com/XYOracleNetwork/xl1-skills/compare/v1.0.3...v1.1.0) (2026-04-28)


### Features

* add atomic-exchange pattern, backfill commit-reveal from escrow ([4e6ef23](https://github.com/XYOracleNetwork/xl1-skills/commit/4e6ef2383d22cd487464799944375a52a43a856f))
* add atomic-exchange pattern, backfill commit-reveal from escrow ([1f07cec](https://github.com/XYOracleNetwork/xl1-skills/commit/1f07cec0c270f36274f94831115e9d7eb335dcc0))
* add audit-imports skill for verifying skill snippet imports ([d1c9d9a](https://github.com/XYOracleNetwork/xl1-skills/commit/d1c9d9a26e9d6656227df9a0b7e80bb798374898))
* add audit-imports skill for verifying skill snippet imports ([cf5535c](https://github.com/XYOracleNetwork/xl1-skills/commit/cf5535c9264a1a13593ac04138006f8e21a59605))
* add carrier patterns, scan strategies, and sentinel transfers ([2a465ae](https://github.com/XYOracleNetwork/xl1-skills/commit/2a465ae424e67d6b4318f0ffc286ff99b6c16311))
* add dApp Definition of Done checklist ([d70305c](https://github.com/XYOracleNetwork/xl1-skills/commit/d70305ca611d4dfce950c117272b365d06f31150))
* add inscription substrate and XRC-20 fungible token patterns ([829019c](https://github.com/XYOracleNetwork/xl1-skills/commit/829019c4f08ca46590e98a3621861a2f31671d41))
* clarify gateway patterns, remove wire internals, add dApp checklist ([252574a](https://github.com/XYOracleNetwork/xl1-skills/commit/252574af61015f4c7bc6876d54c543b6ef0c6c13))
* clarify gateway usage patterns across skill files ([d7bf9e6](https://github.com/XYOracleNetwork/xl1-skills/commit/d7bf9e6a43536cda82fb1d97efa9fe9216a50e2c))
* migrate skills to installable Claude Code plugin marketplace ([e6d5a3a](https://github.com/XYOracleNetwork/xl1-skills/commit/e6d5a3a7f9f82bce84fd57de0b07c32a516c4b65))
* migrate skills to installable plugin marketplace ([16a912b](https://github.com/XYOracleNetwork/xl1-skills/commit/16a912bc1a2707a82951a2f734ca8c19dc8b5618))
* replace ad-hoc localStorage with SDK browser archivists ([1eca8cc](https://github.com/XYOracleNetwork/xl1-skills/commit/1eca8cc4dff289440d129613af6c3c1e5e0f6b08))
* replace ad-hoc localStorage with SDK browser archivists ([dd6285b](https://github.com/XYOracleNetwork/xl1-skills/commit/dd6285bdb09227a213e36363286141cf8687aea0))
* **skills:** add 4-tier Claude Code skill stack for XL1 development ([0783bc1](https://github.com/XYOracleNetwork/xl1-skills/commit/0783bc1040ea80c05722be0b877b7432e56f7a6e))
* **skills:** add development skill (Layer 1) ([5e9e118](https://github.com/XYOracleNetwork/xl1-skills/commit/5e9e1187f75075bb2067de853be4d233618ca80a))
* **skills:** add ESM-only, barrel imports, and tree shaking conventions ([6e56303](https://github.com/XYOracleNetwork/xl1-skills/commit/6e5630367840057ba84efef622db2bf8b8455ebc))
* **skills:** add gitflow branching model to git workflow ([5822443](https://github.com/XYOracleNetwork/xl1-skills/commit/5822443560a3792c915b44cdcf1f8f0ec9bc57c1))
* **skills:** add immutable git history policy ([9c4ce7a](https://github.com/XYOracleNetwork/xl1-skills/commit/9c4ce7ac06e777cd52a992862827a0f011007f55))
* **skills:** add repo conventions, dependency DoD, and mocking policy ([3f588db](https://github.com/XYOracleNetwork/xl1-skills/commit/3f588db51236021f9aa4472e35ddd223d894b989))
* **skills:** add XL1 Knowledge skill (Layer 4) ([add8aab](https://github.com/XYOracleNetwork/xl1-skills/commit/add8aab395d5a723a7cf78517844d75a5168dc9c))
* **skills:** add XY Toolchain skill (Layer 2) ([1477b4e](https://github.com/XYOracleNetwork/xl1-skills/commit/1477b4e9cab6a00acae47e4968c17ef64c1b5a1d))
* **skills:** add XYO Knowledge skill (Layer 3) ([007bf2d](https://github.com/XYOracleNetwork/xl1-skills/commit/007bf2d2aaa5b1279645baaf7dd33807eed45247))


### Bug Fixes

* **skills:** correct ESLint config exports and add React variant ([e0a09d6](https://github.com/XYOracleNetwork/xl1-skills/commit/e0a09d698f209235722e021232ea1c34a762a074))
* **skills:** correct off-chain payload datalake persistence guidance ([89a6196](https://github.com/XYOracleNetwork/xl1-skills/commit/89a6196b7a27a3dfe317519c64b8f7acbf8d8478))
* **skills:** remove references to unpublished chain-* npm packages ([24973eb](https://github.com/XYOracleNetwork/xl1-skills/commit/24973ebdc2e722dcc5b46bda1e490a69e26e98da))
* **skills:** replace bare rpc/datalake vars with SDK constructs ([0886b45](https://github.com/XYOracleNetwork/xl1-skills/commit/0886b457a66e497bfe7d63c672b9f9d3df3da037))
