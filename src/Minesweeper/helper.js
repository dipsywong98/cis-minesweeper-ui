import * as LZUTF8 from 'lzutf8'
import { Buffer } from "buffer";

export function getNearIndexes(index, rows, columns) {
  if (index < 0 || index >= rows * columns) return []
  const row = Math.floor(index / columns)
  const column = index % columns
  return [
    index - columns - 1,
    index - columns,
    index - columns + 1,
    index - 1,
    index + 1,
    index + columns - 1,
    index + columns,
    index + columns + 1,
  ].filter((_, arrayIndex) => {
    if (row === 0 && arrayIndex < 3) return false
    if (row === rows - 1 && arrayIndex > 4) return false
    if (column === 0 && [0, 3, 5].includes(arrayIndex)) return false
    if (column === columns - 1 && [2, 4, 7].includes(arrayIndex)) return false
    return true
  })
}

const getPad = (binLen) => {
  return Array(Math.ceil(binLen / 8) * 8 - binLen).fill('0').join('');
}

const serializeBinaryString = (bin) => {
  const pad = getPad(bin.length)
  const padded = bin+pad
  return Buffer.from(
      padded
        .match(/(.{8})/g)
        ?.map(function (x) {
          return String.fromCharCode(parseInt(x, 2));
        })
        .join('') ?? ''
    ).toString('base64');
}

export const deserializeBinaryString = (b64) => {
  const bin = Buffer.from(b64, 'base64').toString()
    .split('')
    .map(function (x) {
      return ('0000000' + x.charCodeAt(0).toString(2)).slice(-8);
    })
    .join('');
  return bin
}

//   ceils: Array {
//     state: 'cover' || 'flag' || 'unknown' || 'open' || 'die' || 'misflagged' || 'mine',
//     minesAround: Number (negative for mine itself),
//     opening: true || false
//   }
export const serialize = (rows, cols, ceils) => {
  const flags = ceils.map(({ state }) => state === 'mine' ? '1' : '0').join('')
  return LZUTF8.compress([rows, cols, serializeBinaryString(flags)].join(','), {outputEncoding: 'Base64'})
}

export const deserialize = packed => {
  const [rowsS, colsS, flagsS] = LZUTF8.decompress(packed, { inputEncoding: 'Base64' }).split(',')
  const rows = Number.parseInt(rowsS)
  const cols = Number.parseInt(colsS)
  const pad = getPad(rows * cols)
  const flags = deserializeBinaryString(flagsS)
  const mineK = []
  const ceils = flags.replace(RegExp(`${pad}$`), '').split('').map((flag, k) => {
    if (flag === '1') {
      mineK.push(k)
    }
    return {
      state: 'cover',
      minesAround: flag === '1' ? -10 : 0
    }
  })
  mineK.forEach(k => {
    getNearIndexes(k, rows, cols).forEach(nearIndex => {
      ceils[nearIndex].minesAround += 1
    })
  })
  return {
    isCustom: true,
    rows,
    columns: cols,
    ceils,
    mines: mineK.length
  }
}
