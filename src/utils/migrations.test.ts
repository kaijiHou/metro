import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject } from '../models/metro'
import { migrateProjectToCurrent } from './migrations'

describe('project migrations', () => {
  it('keeps schema version 1 unchanged', () => {
    const project = emptyProject('迁移测试')
    assert.equal(migrateProjectToCurrent(project), project)
  })

  it('rejects unsupported future versions', () => {
    assert.throws(() => migrateProjectToCurrent({ version: 99 }), /不支持的项目版本：99/)
  })

  it('rejects missing or malformed versions', () => {
    assert.throws(() => migrateProjectToCurrent({}), /缺少 version/)
    assert.throws(() => migrateProjectToCurrent({ version: '1' }), /必须是整数/)
    assert.throws(() => migrateProjectToCurrent({ version: 1.5 }), /必须是整数/)
  })
})
