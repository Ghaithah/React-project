
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'



export const loadProducts = createAsyncThunk('product/getProducts',
     async ()=> {
    const response= await fetch("http://localhost:8080/products")
    const res= await response.json()
    return res
})


export const productSlice= createSlice({
    name:'product',
    initialState:{
            list:[]
    },
    extraReducers:(builder)=>{
        builder.addCase
        (loadProducts.fulfilled,(state,action) =>{
            state.list = action.payload            
        })
    }})
export default productSlice.reducer;