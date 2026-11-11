x <- c(1,2,3,4,7); y <- c(3,5,8,9,12)
t <- t.test(y,x)
cat(jsonlite::toJSON(list(p=t$p.value,t=unname(t$statistic),df=unname(t$parameter),ci=unname(t$conf.int)),auto_unbox=TRUE,digits=15))
