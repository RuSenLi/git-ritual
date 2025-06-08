#!/usr/bin/env node
'use strict'
import('../dist/runner.js')
  .then(r => r.main())
