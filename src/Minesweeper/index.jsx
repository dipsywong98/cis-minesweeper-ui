import { useReducer, useEffect, useState } from 'react'
import sampleSize from 'lodash.samplesize'

import { Config } from './config'
import MinesweeperView from './MinesweeperView'
import { getNearIndexes } from './helper'

// state: {
//   difficulty: 'Beginner' || 'Intermediate' || 'Expert' || 'Create',
//   status: 'new' || 'started' || 'died' || 'won',
//   rows: Number,
//   columns: Number,
//   mines: Number,
//   ceils: Array {
//     state: 'cover' || 'flag' || 'unknown' || 'open' || 'die' || 'misflagged',
//     minesAround: Number (negative for mine itself),
//     opening: true || false
//   }
// }

const promptInt = (message) => {
  let num = null
  while (typeof num !== 'number' || !Number.isInteger(num) || num < 0) {
    const input = window.prompt(message)
    num = parseInt(input)
  }
  return num
}
  

function getInitState(difficulty = 'Beginner', dimension = {}) {
  if (difficulty === 'Create') {
    return {
      difficulty,
      status: 'new',
      ...genGameConfig({...Config[difficulty], ...dimension}),
    }
  }
  return {
    difficulty,
    status: 'new',
    ...genGameConfig(Config[difficulty]),
  }
}

function reducer(state, action = {}) {
  switch (action.type) {
    case 'CLEAR_MAP':
      return getInitState(action.payload?.difficulty ?? state.difficulty, action.payload?.dimension ?? {})
    case 'START_GAME':
      return {
        ...state,
        ...insertMines({ ...Config[state.difficulty], exclude: action.payload }, state.ceils),
        status: 'started',
      }
    case 'OPEN_CEIL': {
      const indexes = autoCeils(state, action.payload)
      const ceils = [...state.ceils]
      indexes.forEach(i => {
        const ceil = ceils[i]
        ceils[i] = { ...ceil, state: 'open' }
      })
      return {
        ...state,
        ceils,
      }
    }
    case 'CHANGE_CEIL_STATE': {
      const index = action.payload
      const ceils = [...state.ceils]
      const ceil = state.ceils[index]
      let newState
      switch (ceil.state) {
        case 'cover':
          newState = 'flag'
          break
        case 'flag':
          newState = 'unknown'
          break
        case 'unknown':
          newState = 'cover'
          break
        default:
          throw new Error(`Unknown ceil state ${ceil.state}`)
      }
      ceils[index] = { ...ceil, state: newState }
      return {
        ...state,
        ceils,
      }
    }
    case 'GAME_OVER': {
      const ceils = state.ceils.map(ceil => {
        if (ceil.minesAround < 0 && ceil.state !== 'flag') {
          return {
            ...ceil,
            state: 'mine',
          }
        } else if (ceil.state === 'flag' && ceil.minesAround >= 0) {
          return {
            ...ceil,
            state: 'misflagged',
          }
        } else {
          return {
            ...ceil,
            opening: false,
          }
        }
      })
      ceils[action.payload].state = 'die'
      return {
        ...state,
        status: 'died',
        ceils,
      }
    }
    case 'WON': {
      const ceils = state.ceils.map(ceil => {
        if (ceil.minesAround >= 0) {
          return {
            ...ceil,
            state: 'open',
          }
        } else {
          return {
            ...ceil,
            state: 'flag',
          }
        }
      })
      return {
        ...state,
        status: 'won',
        ceils,
      }
    }
    case 'OPENING_CEIL': {
      const ceil = state.ceils[action.payload]
      const ceils = state.ceils.map(ceil => ({
        ...ceil,
        opening: false,
      }))
      ceils[action.payload] = { ...ceil, opening: true }
      return {
        ...state,
        ceils,
      }
    }
    case 'EDIT_CEIL': {
      const {index, flag} = action.payload
      const ceil = state.ceils[index]
      const ceils = state.ceils.map(ceil => ({
        ...ceil
      }))
      ceils[index] = {
        ...ceil,
        minesAround: flag ? -10 : 0,
        state: flag ? 'mine' : 'cover'
      }
      return {
        ...state,
        ceils,
      }
    }
    case 'OPENING_CEILS': {
      const indexes = getNearIndexes(action.payload, state.rows, state.columns)
      const ceils = state.ceils.map(ceil => ({
        ...ceil,
        opening: false,
      }));
      [...indexes, action.payload].forEach(index => {
        const ceil = { ...ceils[index] }
        ceil.opening = true
        ceils[index] = ceil
      })
      return {
        ...state,
        ceils,
      }
    }
    default:
      return state
  }
}

function MineSweeper({
                       defaultDifficulty,
                       onClose,
                       sameTouchPos,
                       lastTouch,
                       platform,
                     }) {
  const [state, dispatch] = useReducer(
    reducer,
    {},
    () => getInitState(defaultDifficulty),
  )
  const seconds = useTimer(state.status)

  function changeCeilState(index) {
    const ceil = state.ceils[index]
    if (ceil.state === 'open' || ['won', 'died'].includes(state.status)) return
    dispatch({ type: 'CHANGE_CEIL_STATE', payload: index })
  }

  function openCeil(index) {
    switch (state.status) {
      case 'new':
        dispatch({ type: 'START_GAME', payload: index })
        dispatch({ type: 'OPEN_CEIL', payload: index })
        break
      case 'started':{
        const ceil = state.ceils[index]
        if (['flag', 'open'].includes(ceil.state)) {
          break
        } else if (ceil.minesAround < 0) {
          dispatch({ type: 'GAME_OVER', payload: index })
        } else {
          dispatch({ type: 'OPEN_CEIL', payload: index })
        }
        break
      }
      default:
        console.log(state.status)
    }
  }

  function openCeils(index) {
    const ceil = state.ceils[index]
    if (
      ceil.state !== 'open' ||
      ceil.minesAround <= 0 ||
      state.status !== 'started'
    )
      return
    const indexes = getNearIndexes(index, state.rows, state.columns)
    const nearCeils = indexes.map(i => state.ceils[i])
    if (
      nearCeils.filter(ceil => ceil.state === 'flag').length !==
      ceil.minesAround
    )
      return
    const mineIndex = indexes.find(
      i => state.ceils[i].minesAround < 0 && state.ceils[i].state !== 'flag',
    )
    if (mineIndex) {
      dispatch({ type: 'GAME_OVER', payload: mineIndex })
    } else {
      indexes.forEach(i => dispatch({ type: 'OPEN_CEIL', payload: i }))
    }
  }

  useEffect(() => {
    if (state.status === 'started' && checkRemains() === 0) {
      dispatch({ type: 'WON' })
    }
  })

  function onReset(difficulty) {
    if (difficulty !== 'Create') {
      dispatch({ type: 'CLEAR_MAP', payload: { difficulty } })
    } else {
      dispatch({ type: 'CLEAR_MAP', payload: { difficulty, dimension: {
        columns: promptInt('input columns'),
        rows: promptInt('input rows'),
      } } })
    }
  }

  function checkRemains() {
    const safeCeils = state.ceils
      .filter(ceil => ceil.state !== 'open')
      .filter(ceil => ceil.minesAround >= 0)
    return safeCeils.length
  }

  function openingCeil(index) {
    if (['died', 'won'].includes(state.status)) return
    dispatch({ type: 'OPENING_CEIL', payload: index })
  }

  function openingCeils(index) {
    if (['died', 'won'].includes(state.status)) return
    dispatch({ type: 'OPENING_CEILS', payload: index })
  }

  function editCeil(index, flag) {
    dispatch({ type: 'EDIT_CEIL', payload: { index, flag } })
  }

  return (
    <MinesweeperView
      {...state}
      onClose={onClose}
      changeCeilState={changeCeilState}
      openCeil={openCeil}
      openCeils={openCeils}
      editCeil={editCeil}
      onReset={onReset}
      seconds={seconds}
      openingCeil={openingCeil}
      openingCeils={openingCeils}
      sameTouchPos={sameTouchPos}
      lastTouch={lastTouch}
      platform={platform}
    />
  )
}

function genGameConfig(config) {
  const { rows, columns, mines } = config
  const ceils = Array(rows * columns)
    .fill()
    .map(() => ({
      state: 'cover',
      minesAround: 0,
      opening: false,
    }))
  return {
    rows,
    columns,
    ceils: config.isCustom ? config.ceils : ceils,
    mines,
  }
}

function insertMines(config, originCeils) {
  if (window.location.hash === '') {
    const { rows, columns, mines, exclude } = config
    const ceils = originCeils.map(ceil => ({ ...ceil }))
    if (rows * columns !== ceils.length)
      throw new Error('rows and columns not equal to ceils')
    const indexArray = [...Array(rows * columns).keys()]
    sampleSize(indexArray.filter(i => i !== exclude), mines).forEach(chosen => {
      ceils[chosen].minesAround = -10
      getNearIndexes(chosen, rows, columns).forEach(nearIndex => {
        ceils[nearIndex].minesAround += 1
      })
    })
    return {
      rows,
      columns,
      ceils,
      mines,
    }
  } else {
    return config
  }
}

function autoCeils(state, index) {
  const { rows, columns } = state
  const ceils = state.ceils.map(ceil => ({
    ...ceil,
    walked: false,
  }))
  return walkCeils(index)

  function walkCeils(index) {
    const ceil = ceils[index]
    if (ceil.walked || ceil.minesAround < 0 || ceil.state === 'flag') return []
    ceil.walked = true
    if (ceil.minesAround > 0) return [index]
    return [
      index,
      ...getNearIndexes(index, rows, columns).reduce(
        (lastIndexes, ceilIndex) => {
          return [...lastIndexes, ...walkCeils(ceilIndex)]
        },
        [],
      ),
    ]
  }
}

function useTimer(status) {
  const [seconds, setSeconds] = useState(0)

  function addSecond() {
    setSeconds(sec => sec + 1)
  }

  useEffect(() => {
    let timer
    switch (status) {
      case 'started':
        timer = setInterval(addSecond, 1000)
        break
      case 'new':
        setSeconds(0)
        break
      default:
        break
    }
    return () => clearInterval(timer)
  }, [status])
  return seconds
}

export default MineSweeper
