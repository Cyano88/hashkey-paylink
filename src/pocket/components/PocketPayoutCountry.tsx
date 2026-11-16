import PocketCountrySelect from './PocketCountrySelect'
export default function PocketPayoutCountry({value,onChange,label='Country'}:{value:string;onChange:(value:string)=>void;label?:string}) {
 return <div><span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{label}</span><PocketCountrySelect ariaLabel="Payout country" value={value} onChange={onChange} options={[{value:'NG',label:'Nigeria (NGN)'},{value:'UG',label:'Uganda (UGX)'}]} /></div>
}
