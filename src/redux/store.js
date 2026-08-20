import productReducer from './productslice'
import {configureStore} from '@reduxjs/toolkit'

export const productStore= configureStore({
    reducer:{
        pr: productReducer,
    }
})